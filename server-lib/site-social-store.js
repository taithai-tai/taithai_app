import { FieldPath } from 'firebase-admin/firestore';
import { createMembershipStore } from './site-membership-core.js';
import { assertMembershipOperationActive } from './site-operation-budget.js';

function collectionPath(value) {
  if(typeof value!=='string'||value.length>512||!/^siteSocial[A-Za-z]+(?:\/[A-Za-z0-9_.:-]{1,128})*$/.test(value)||value.split('/').length%2!==1)throw Error('INVALID_SOCIAL_COLLECTION');
  return value;
}
export function createSocialStore(db) {
  const base=createMembershipStore(db),guard=fn=>(...args)=>{assertMembershipOperationActive();return fn(...args);};
  const transaction=fn=>{assertMembershipOperationActive();return base.transaction(tx=>fn(Object.fromEntries(['get','set','create','delete'].map(name=>[name,guard(tx[name])]))));};
  return {...base,get:guard(base.get),set:guard(base.set),create:guard(base.create),delete:guard(base.delete),transaction,runTransaction:transaction,
    async list(path,{where=[],limit=20,orderBy=[],startAfter}={}) {
      assertMembershipOperationActive();collectionPath(path);
      if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_SOCIAL_QUERY');
      let query=db.collection(path);for(const [field,operator,value] of where)query=query.where(field,operator,value);
      const orders=Array.isArray(orderBy[0])?orderBy:orderBy.length?[orderBy]:[];
      for(const [field,direction='asc'] of orders)query=query.orderBy(field==='__name__'?FieldPath.documentId():field,direction);
      if(startAfter!==undefined){if(!Array.isArray(startAfter)||startAfter.length!==orders.length||!orders.length)throw Error('INVALID_SOCIAL_CURSOR');query=query.startAfter(...startAfter);}
      const snapshot=await query.limit(limit).get();assertMembershipOperationActive();
      return snapshot.docs.map(doc=>({...doc.data(),id:doc.id}));
    }
  };
}
