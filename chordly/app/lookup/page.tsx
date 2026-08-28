import { Suspense } from 'react';
import { LookupSong } from '@/components/lookup-song';
export default function LookupPage(){return <Suspense fallback={<main className="lookupPage wrap"/>}><LookupSong/></Suspense>}
