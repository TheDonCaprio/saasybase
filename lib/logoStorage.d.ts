/// <reference types="node" />

export interface SaveAssetParams {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export declare function saveLogo(params: SaveAssetParams): Promise<string>;
export declare function saveAdminFile(params: SaveAssetParams): Promise<string>;

export interface AdminFileInfo {
  key: string;
  url: string;
  filename: string;
  size?: number;
  uploadedAt?: string;
}

export interface ListAdminFilesOptions {
  limit?: number;
  cursor?: string | null;
  search?: string | null;
}

export interface ListAdminFilesResult {
  files: AdminFileInfo[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
}

export declare function listAdminFiles(options?: ListAdminFilesOptions): Promise<ListAdminFilesResult>;
export interface DeleteAdminFileParams {
  key: string;
}

export declare function deleteAdminFile(params: DeleteAdminFileParams): Promise<boolean>;
