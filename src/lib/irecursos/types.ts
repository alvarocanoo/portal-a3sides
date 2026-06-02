export interface IRecursosSession {
  phpSessionId: string;
  ilehdSession: string;
  empresa: string;
  expiresAt: number;
}

export interface IRecursosContract {
  id: string;
  description: string;
  state: string;
}

export interface XJXResponse {
  success: boolean;
  commands: { cmd: string; id?: string; value?: string }[];
  rawXml: string;
}
