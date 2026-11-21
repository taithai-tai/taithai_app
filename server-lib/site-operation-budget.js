import { AsyncLocalStorage } from 'node:async_hooks';

const operations = new AsyncLocalStorage();
export const MEMBERSHIP_OPERATION_TIMEOUT_MS = 45000;
export const MEMBERSHIP_REMOTE_TIMEOUT_MS = 8000;

export class MembershipOperationError extends Error {
  constructor() { super('OPERATION_TIMEOUT');this.name='MembershipOperationError';this.code='OPERATION_TIMEOUT';this.status=503; }
}
const timeoutError = () => new MembershipOperationError();
const validTimeout = (value,maximum) => Number.isSafeInteger(value) && value>=1 && value<=maximum;

export function membershipOperationSignal() { return operations.getStore()?.signal; }
export function assertMembershipOperationActive() {
  const current=operations.getStore();
  if (!current) return Infinity;
  const remaining=current.deadline-performance.now();
  if (!current.open || current.signal.aborted || remaining<=0) throw timeoutError();
  return Math.ceil(remaining);
}
export function combineMembershipOperationSignal(...signals) {
  assertMembershipOperationActive();
  const inputs=[membershipOperationSignal(),...signals].filter(signal=>signal!==undefined && signal!==null);
  if (!inputs.length) return undefined;
  return inputs.length===1?inputs[0]:AbortSignal.any(inputs);
}

// The aborted context remains attached to late continuations after the caller
// receives a timeout. Such work can release locks/persist uncertain outcomes,
// but cannot begin another external request through the shared transport.
export async function withMembershipOperationBudget(fn,{timeoutMs=MEMBERSHIP_OPERATION_TIMEOUT_MS,signal}={}) {
  if (typeof fn!=='function' || !validTimeout(timeoutMs,MEMBERSHIP_OPERATION_TIMEOUT_MS)) throw new TypeError('INVALID_OPERATION_BUDGET');
  assertMembershipOperationActive();
  const parent=operations.getStore(), controller=new AbortController();
  const combined=AbortSignal.any([controller.signal,...(parent?[parent.signal]:[]),...(signal?[signal]:[])]);
  const current={signal:combined,deadline:Math.min(performance.now()+timeoutMs,parent?.deadline ?? Infinity),open:true};
  let timer,onAbort;
  return operations.run(current,async()=>{
    try {
      assertMembershipOperationActive();
      const expired=new Promise((_,reject)=>{
        onAbort=()=>reject(timeoutError());
        combined.addEventListener('abort',onAbort,{once:true});
        if (combined.aborted) onAbort();
      });
      timer=setTimeout(()=>controller.abort(timeoutError()),Math.max(1,Math.ceil(current.deadline-performance.now())));
      const operation=Promise.resolve().then(()=>{assertMembershipOperationActive();return fn();}).then(value=>{assertMembershipOperationActive();return value;});
      return await Promise.race([operation,expired]);
    } catch(error) {
      // A transport can wrap the abort before a busy event loop dispatches the
      // timer callback. The expired scope must still have one stable result.
      if (combined.aborted || performance.now()>=current.deadline) throw timeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
      if (onAbort) combined.removeEventListener('abort',onAbort);
      current.open=false;
      controller.abort(timeoutError());
    }
  });
}

// Pass this function to Stripe.createFetchHttpClient. Keep the native signals
// armed through response-body consumption, not merely until headers arrive.
export function createMembershipFetch(fetchImpl=globalThis.fetch,{timeoutMs=MEMBERSHIP_REMOTE_TIMEOUT_MS}={}) {
  if (typeof fetchImpl!=='function' || !validTimeout(timeoutMs,MEMBERSHIP_REMOTE_TIMEOUT_MS)) throw new TypeError('INVALID_REMOTE_BUDGET');
  return async (input,init={})=>{
    assertMembershipOperationActive();
    const signal=combineMembershipOperationSignal(init.signal,input instanceof Request?input.signal:undefined,AbortSignal.timeout(timeoutMs));
    // In particular, a delayed continuation must fail before any POST bytes.
    signal?.throwIfAborted();
    return fetchImpl(input,{...init,signal});
  };
}
