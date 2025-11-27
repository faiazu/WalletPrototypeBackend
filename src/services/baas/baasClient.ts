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
 * Parameters to create a BaaS card for a customer.
 */
export interface CreateCardParams {
  userId: string;             // internal Divvi user id (for context/logging)
  externalCustomerId: string; // provider’s customer id
}

/**
 * Result returned when a BaaS card has been created.
 */
export interface CreateCardResult {
  provider: BaasProviderName;
  externalCardId: string; // provider-specific card id/token
  last4?: string;         // optional, for display
}

/**
 * BaasClient defines the minimal set of operations Divvi can ask a BaaS to perform.
 * Each concrete implementation (Mock, Stripe, Lithic, etc.) will implement this.
 */
export interface BaasClient {
  createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult>;
  createCard(params: CreateCardParams): Promise<CreateCardResult>;
  // later: getProgramBalance, initiateTransfer, freezeCard, etc.
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
}
