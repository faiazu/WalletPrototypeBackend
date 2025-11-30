import { BaasProviderName } from "./baasTypes.js";

/**
 * Parameters to create a BaaS customer for a Divvi user
 * This is provider agnostic, adapter will map it to the real API payload
 */
export interface CreateCustomerParams {
  userId: string;         // internal Divvi user id
  email: string;
  legalName?: string;
}

/**
 * Result returned when a BaaS customer has been (or already was) created.
 */
export interface CreateCustomerResult {
  provider: BaasProviderName;
  externalCustomerId: string; // provider-specific customer id
}

/**
 * Parameters to create a BaaS account for a customer.
 */
export interface CreateAccountParams {
  externalCustomerId: string; // provider’s customer id
  accountType?: string;       // e.g. CHECKING, SAVING
  currency?: string;          // e.g. USD
  accountTemplateId?: string; // provider-specific template id (optional)
}

/**
 * Result returned when a BaaS account has been created.
 */
export interface CreateAccountResult {
  provider: BaasProviderName;
  externalAccountId: string;
  status?: string;
  accessStatus?: string;
  accountType?: string;
  currency?: string;
  accountNumberLast4?: string;
  routingNumber?: string;
  rawResponse?: any;
}

/**
 * Parameters to create a BaaS card for a customer.
 */
export interface CreateCardParams {
  userId: string;             // internal Divvi user id (for context/logging)
  externalCustomerId: string; // provider’s customer id
  externalAccountId?: string; // provider’s account id (if required by provider)
  cardProductId?: string;     // provider-specific card product/program id
  cardType?: string;          // e.g. VIRTUAL/PHYSICAL
  embossName?: string;        // formatted name for embossing (line_1)
}

/**
 * Result returned when a BaaS card has been created.
 */
export interface CreateCardResult {
  provider: BaasProviderName;
  externalCardId: string; // provider-specific card id/token
  last4?: string;         // optional, for display
  status?: string;
}

/**
 * BaasClient defines the minimal set of operations Divvi can ask a BaaS to perform.
 * Each concrete implementation (Mock, Stripe, Lithic, etc.) will implement this.
 */
export interface BaasClient {
  createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult>;
  createCard(params: CreateCardParams): Promise<CreateCardResult>;
  createAccount?(params: CreateAccountParams): Promise<CreateAccountResult>;
  updateCardStatus?(cardId: string, status: string): Promise<void>;
  // later: getProgramBalance, initiateTransfer, freezeCard, etc.
}

export function supportsAccountCreation(
  client: BaasClient
): client is BaasClient & { createAccount: (params: CreateAccountParams) => Promise<CreateAccountResult> } {
  return typeof (client as any)?.createAccount === "function";
}

/**
 * A simple mock implementation of BaasClient.
 * This does NOT call any real provider, it just returns deterministic fake ids.
 */
export class MockBaasClient implements BaasClient {
  private provider: BaasProviderName = BaasProviderName.MOCK;

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const externalCustomerId = `mock_cust_${params.userId}`;

    return {
      provider: this.provider,
      externalCustomerId,
    };
  }

  async createCard(params: CreateCardParams): Promise<CreateCardResult> {
    return {
      provider: this.provider,
      externalCardId: params.externalCustomerId.replace("cust", "card"),
      last4: "4242",
    };
  }

  async createAccount(params: CreateAccountParams): Promise<CreateAccountResult> {
    return {
      provider: this.provider,
      externalAccountId: `mock_acct_${params.externalCustomerId}`,
      status: "ACTIVE",
      accountType: params.accountType ?? "CHECKING",
      currency: params.currency ?? "USD",
    };
  }

  async updateCardStatus(_cardId: string, _status: string): Promise<void> {
    // no-op for mock
    return;
  }
}
