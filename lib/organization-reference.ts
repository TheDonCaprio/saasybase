type OrganizationReference = {
  id: string;
  providerOrganizationId?: string | null;
};

export function getOrganizationReferenceWhere(organizationRef: string) {
  return [
    { id: organizationRef },
    { providerOrganizationId: organizationRef },
  ];
}

export function getMembershipOrganizationReferenceWhere(organizationRef: string) {
  return [
    { organizationId: organizationRef },
    { organization: { providerOrganizationId: organizationRef } },
  ];
}

export function hasMatchingOrganizationReference(
  organization: OrganizationReference,
  requestedOrganizationRef: string,
) {
  return organization.id === requestedOrganizationRef || organization.providerOrganizationId === requestedOrganizationRef;
}