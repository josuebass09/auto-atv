import axios from 'axios';

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

const UPSERT_MUTATION = `
  mutation variableUpsert($input: VariableUpsertInput!) {
    variableUpsert(input: $input)
  }
`;

export async function updateRailwayVar(name: string, value: string): Promise<void> {
  const token         = process.env['RAILWAY_TOKEN'];
  const projectId     = process.env['RAILWAY_PROJECT_ID'];
  const environmentId = process.env['RAILWAY_ENVIRONMENT_ID'];
  const serviceId     = process.env['RAILWAY_SERVICE_ID'];

  const missing = [
    !token         && 'RAILWAY_TOKEN',
    !projectId     && 'RAILWAY_PROJECT_ID',
    !environmentId && 'RAILWAY_ENVIRONMENT_ID',
    !serviceId     && 'RAILWAY_SERVICE_ID',
  ].filter(Boolean);

  if (missing.length > 0) {
    console.warn(`[CRON] Saltando actualizacion de ${name}: faltan vars ${missing.join(', ')}`);
    return;
  }

  console.log(`[CRON] Actualizando ${name}=${value} via Railway API...`);

  const response = await axios.post(
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

  if (response.data?.errors?.length) {
    throw new Error(`Railway API error: ${JSON.stringify(response.data.errors)}`);
  }

  console.log(`[CRON] ${name} actualizado a ${value}`);
}
