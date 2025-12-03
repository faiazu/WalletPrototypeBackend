export interface GetUserByIdInput {
  id: string;
}

export interface GetUserByEmailInput {
  email: string;
}

export interface EnsureUserByEmailInput {
  email: string;
  name?: string;
}

export interface DeactivateUserInput {
  userId: string;
}

