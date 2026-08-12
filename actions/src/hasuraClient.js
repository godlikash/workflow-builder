const { GraphQLClient, gql } = require('graphql-request');

const HASURA_GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL; // e.g. https://<sub>.nhost.run/v1/graphql
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

// The Action handler runs server-side and is the ONLY thing that ever
// writes to workflow_runs / step_runs — it always talks to Hasura as
// admin, so table-level RLS never blocks it. All authorization for
// *what the caller is allowed to do* happens explicitly in code below
// (see permissions.js) before any admin write happens.
const client = new GraphQLClient(HASURA_GRAPHQL_URL, {
  headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET },
});

module.exports = { client, gql };
