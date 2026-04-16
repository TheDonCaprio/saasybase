import { getAuthSafe } from '../../lib/auth';
import LandingClientAlt from '../../components/LandingClient';

export default async function LandingAltPage() {
  const auth = await getAuthSafe();
  return <LandingClientAlt isSignedIn={Boolean(auth?.userId)} />;
}
