export interface IRecursosSession {
  phpSessionId: string;
  ilehdSession: string;
  empresa: string;
  expiresAt: number;
}

export interface IRecursosClient {
  codcli: string;
  name: string;
  nif: string;
  address: string;
  phone: string;
  email: string;
}

export interface IRecursosOT {
  id: string;
  description: string;
  clientCode: string;
  clientName: string;
  status: string;
  createdAt: string;
}

export interface IRecursosContract {
  id: string;
  description: string;
  state: string;
}

export interface IRecursosParte {
  id?: string;
  otId: string;
  projectId: string;
  phaseId: string;
  description: string;
  date: string;
  createdBy: string;
}

export interface XJXResponse {
  success: boolean;
  commands: { cmd: string; id?: string; value?: string }[];
  rawXml: string;
}
