// Stage 1 schema contract. Regenerate with `supabase gen types typescript --linked`
// after applying migrations to a real test project, and review changes.
export type CompanyRole = 'owner' | 'admin' | 'member' | 'viewer';
export type CompanyPermission = 'company.read' | 'company.update' | 'members.read' | 'members.manage' | 'roles.grant';
type Profile = { id:string; full_name:string; created_at:string; updated_at:string }
type Company = { id:string; name:string; legal_name:string|null; created_by:string; created_at:string; updated_at:string }
type Membership = { id:string; company_id:string; user_id:string; role:CompanyRole; created_at:string; updated_at:string }
type Preference = { user_id:string; active_company_id:string|null; updated_at:string }
type Table<Row,Insert,Update> = { Row:Row; Insert:Insert; Update:Update; Relationships:[] };
export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile,{id:string;full_name?:string},{full_name?:string}>;
      companies: Table<Company,{name:string;created_by:string;legal_name?:string|null},{name?:string;legal_name?:string|null}>;
      company_memberships: Table<Membership,{company_id:string;user_id:string;role?:CompanyRole},{role?:CompanyRole}>;
      user_preferences: Table<Preference,{user_id:string;active_company_id?:string|null},{active_company_id?:string|null}>;
    };
    Views: Record<string,never>;
    Functions: {
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
