export interface IssueTokenInput {
  userId: string;
}

export interface GoogleSignInInput {
  idToken: string;
}

export interface GoogleSignInOutput {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  token: string;
}

