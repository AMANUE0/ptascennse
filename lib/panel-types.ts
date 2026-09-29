import type { ServerStatus } from "@/components/ui";

export type ServerRecord = {
  id?: string;
  name: string;
  type: string;
  version: string;
  status: ServerStatus;
  address: string;
  ram: string;
  color?: string;
  java?: string;
  command?: string;
  port?: number;
  jar?: string;
  cpu?: string;
  storageGb?: number;
  isSubuser?: boolean;
  permissions?: Record<string, boolean>;
};