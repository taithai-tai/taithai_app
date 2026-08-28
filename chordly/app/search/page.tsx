import { Suspense } from 'react';
import { SearchResults } from '@/components/search-results';
export default function SearchPage(){return <Suspense fallback={<main className="searchPage wrap"><div className="resultSkeleton"><i/><i/><i/></div></main>}><SearchResults/></Suspense>}
