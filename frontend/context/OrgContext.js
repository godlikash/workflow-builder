import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_MY_ORGS } from '../lib/graphql/queries';

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const { data, loading } = useQuery(GET_MY_ORGS);
  const [orgId, setOrgId] = useState(null);

  const memberships = data?.org_members ?? [];

  useEffect(() => {
    if (!orgId && memberships.length > 0) setOrgId(memberships[0].org.id);
  }, [memberships, orgId]);

  const current = memberships.find((m) => m.org.id === orgId);

  return (
    <OrgContext.Provider
      value={{
        loading,
        memberships,
        orgId,
        setOrgId,
        role: current?.role ?? null, // 'owner' | 'editor' | 'viewer'
        orgName: current?.org.name ?? null,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
