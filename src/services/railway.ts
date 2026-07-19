import axios from 'axios';

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

const UPSERT_MUTATION = `
  mutation variableUpsert($input: VariableUpsertInput!) {
    variableUpsert(input: $input)
  }
`;

export async function updateRailwayVar(name: string, value: string): Promise<void> {
  const token       = process.env['RAILWAY_TOKEN'];
  const projectId   = process.env['RAILWAY_PROJECT_ID'];
  const environmentId = process.env['RAILWAY_ENVIRONMENT_ID'];
  const serviceId   = process.env['RAILWAY_SERVICE_ID'];

  if (!token || !projectId || !environmentId || !serviceId) {
    console.warn('[CRON] Railway env vars no configuradas (RAILWAY_TOKEN, PROJECT_ID, ENVIRONMENT_ID, SERVICE_ID). Saltando actualizacion.');
    return;
  }

  await axios.post(
    RAILWAY_API,
    {
      query: UPSERT_MUTATION,
      variables: {
        input: { projectId, environmentId, serviceId, name, value },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    },
  );
}
