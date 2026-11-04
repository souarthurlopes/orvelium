// Schema contract for the identity/company and clients migrations. Regenerate with `supabase gen types typescript --linked`
// after applying migrations to a real test project, and review changes.
export type Json = string | number | boolean | null | { [key:string]:Json|undefined } | Json[];
export type CompanyRole = 'owner' | 'admin' | 'member' | 'viewer';
export type CompanyPermission = 'company.read' | 'company.update' | 'members.read' | 'members.manage' | 'roles.grant';
type Profile = { id:string; full_name:string; created_at:string; updated_at:string }
type Company = { id:string; name:string; legal_name:string|null; created_by:string; created_at:string; updated_at:string }
type Membership = { id:string; company_id:string; user_id:string; role:CompanyRole; created_at:string; updated_at:string }
type Preference = { user_id:string; active_company_id:string|null; updated_at:string }
export type ClientRow = { id:string; company_id:string; type:'individual'|'company'; status:'active'|'inactive'; name:string; document:string; phone:string; email:string; address:string; city:string; state:string; notes:string; created_by:string|null; created_at:string; updated_at:string }
export type ClientWrite = Pick<ClientRow,'type'|'status'|'name'|'document'|'phone'|'email'|'address'|'city'|'state'|'notes'>;
export type QuoteRow = {id:string;company_id:string;number:number;revision:number;client_id:string;client_snapshot:Json;company_snapshot:Json;date:string;valid_until:string;status:'draft'|'sent'|'approved'|'rejected'|'expired';items:Json;discount_kind:'fixed'|'percent';discount_value:number;subtotal_cents:number;discount_cents:number;total_cents:number;notes:string;payment_terms:string;issued_at:string|null;created_by:string|null;created_at:string;updated_at:string};
type Table<Row,Insert,Update> = { Row:Row; Insert:Insert; Update:Update; Relationships:[] };
export interface Database {
  public: {
    Tables: {
      quotes: Table<QuoteRow,never,never>;
      clients: Table<ClientRow,ClientWrite & {company_id:string},Partial<ClientWrite>>;
      profiles: Table<Profile,{id:string;full_name?:string},{full_name?:string}>;
      companies: Table<Company,{name:string;created_by:string;legal_name?:string|null},{name?:string;legal_name?:string|null}>;
      company_memberships: Table<Membership,{company_id:string;user_id:string;role?:CompanyRole},{role?:CompanyRole}>;
      user_preferences: Table<Preference,{user_id:string;active_company_id?:string|null},{active_company_id?:string|null}>;
    };
    Views: Record<string,never>;
    Functions: {
      create_quote: {Args:{p_company_id:string;p_input:Json};Returns:QuoteRow[]};
      update_quote: {Args:{p_company_id:string;p_quote_id:string;p_revision:number;p_input:Json};Returns:QuoteRow[]};
      remove_quote: {Args:{p_company_id:string;p_quote_id:string;p_revision:number};Returns:undefined};
      create_company: { Args:{p_name:string;p_legal_name?:string|null}; Returns:string };
      set_active_company: { Args:{p_company_id:string}; Returns:undefined };
      add_company_member: { Args:{p_company_id:string;p_user_id:string;p_role?:CompanyRole}; Returns:string };
      set_company_member_role: { Args:{p_company_id:string;p_user_id:string;p_role:CompanyRole}; Returns:undefined };
      remove_company_member: { Args:{p_company_id:string;p_user_id:string}; Returns:undefined };
    };
    Enums: { company_role:CompanyRole; company_permission:CompanyPermission };
    CompositeTypes: Record<string,never>;
  };
}
