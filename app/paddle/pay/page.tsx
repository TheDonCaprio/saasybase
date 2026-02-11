import { Suspense } from 'react';
import PaddlePayClient from './PaddlePayClient';

export default function PaddlePayPage() {
	// Next.js requires useSearchParams() usage to be wrapped in Suspense.
	return (
		<Suspense fallback={<main className="mx-auto max-w-xl px-6 py-16" />}>
			<PaddlePayClient />
		</Suspense>
	);
}
