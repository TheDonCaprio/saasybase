import { authService } from '@/lib/auth-provider';
import type { AuthOrganization, AuthOrganizationMembership } from '@/lib/auth-provider';

class WorkspaceService {
  get providerName(): string {
    return authService.providerName;
  }

  get usesExternalProviderOrganizations(): boolean {
    return this.providerName === 'clerk';
  }

  async createProviderOrganization(opts: {
    name: string;
    slug?: string;
    createdByUserId: string;
    maxAllowedMemberships?: number;
    publicMetadata?: Record<string, unknown>;
  }): Promise<AuthOrganization> {
    return authService.createOrganization(opts);
  }

  async getProviderOrganization(organizationId: string): Promise<AuthOrganization | null> {
    return authService.getOrganization(organizationId);
  }

  async updateProviderOrganization(
    organizationId: string,
    data: {
      name?: string;
      slug?: string;
      maxAllowedMemberships?: number;
      publicMetadata?: Record<string, unknown>;
    }
  ): Promise<AuthOrganization> {
    return authService.updateOrganization(organizationId, data);
  }

  async deleteProviderOrganization(organizationId: string): Promise<void> {
    return authService.deleteOrganization(organizationId);
  }

  async createProviderMembership(opts: {
    organizationId: string;
    userId: string;
    role: string;
  }): Promise<AuthOrganizationMembership> {
    return authService.createOrganizationMembership(opts);
  }

  async deleteProviderMembership(opts: {
    organizationId: string;
    userId: string;
  }): Promise<void> {
    return authService.deleteOrganizationMembership(opts);
  }

  async listProviderMemberships(organizationId: string): Promise<AuthOrganizationMembership[]> {
    return authService.listOrganizationMemberships(organizationId);
  }

  async listProviderOrganizationsForUser(userId: string): Promise<AuthOrganization[]> {
    return authService.listUserOrganizations(userId);
  }
}

export const workspaceService = new WorkspaceService();