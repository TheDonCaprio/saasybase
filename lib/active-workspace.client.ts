export async function activateWorkspaceAndNavigate(organizationId: string, destination = '/dashboard/team') {
  try {
    const response = await fetch('/api/user/active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: organizationId }),
    });

    if (!response.ok) {
      return false;
    }

    window.location.assign(destination);
    return true;
  } catch {
    return false;
  }
}