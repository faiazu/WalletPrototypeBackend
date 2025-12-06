export interface SyncteraCardResponse {
  id: string;
  status?: string;
  last_four_digits?: string;
  account_id?: string;
  customer_id?: string;
  nickname?: string;
  card_product_id?: string;
}

export interface SyncteraAccountResponse {
  id: string;
  status?: string;
  currency?: string;
  account_number_last_four?: string;
  routing_number?: string;
}

export interface SyncteraCustomerResponse {
  id: string;
  status?: string;
  email?: string;
  phone?: string;
  full_name?: string;
}

export interface SyncteraClientTokenResponse {
  client_token: string;
}

export interface SyncteraWidgetUrlResponse {
  url: string;
}

export interface SyncteraSingleUseTokenResponse {
  token: string;
  expires?: string;
  customer_account_mapping_id?: string;
}
