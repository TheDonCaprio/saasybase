import { NotFoundPage } from '../../components/NotFoundPage';
import { buildDashboardMetadata } from '../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'Page not found',
    description: 'The page you are looking for does not exist or has been moved.',
    audience: 'user',
  });
}

export default function StandaloneNotFoundPage() {
  return <NotFoundPage />;
}