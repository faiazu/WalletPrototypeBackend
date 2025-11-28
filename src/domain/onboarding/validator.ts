import { z } from "zod";

export const addressSchema = z.object({
  address_line_1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country_code: z.string().length(2),
});

export const disclosureSchema = z.object({
  type: z.string().min(1),
  version: z.string().min(1),
});

export const kycSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  dob: z.string().min(1), // ISO date string
  phone_number: z.string().min(1),
  email: z.email(),
  ssn: z.string().min(1),
  legal_address: addressSchema,
  disclosures: z.array(disclosureSchema).optional(),
  customer_ip_address: z.string().min(1).optional(),
});
