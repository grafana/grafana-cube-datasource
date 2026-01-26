import { test, expect } from '@grafana/plugin-e2e';
import { CubeDataSourceOptions, CubeSecureJsonData } from '../src/types';

test('smoke: should render config editor', async ({ createDataSourceConfigPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });
  await expect(page.getByLabel('Cube API URL')).toBeVisible();
});
test('"Save & test" should be successful when configuration is valid', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource<CubeDataSourceOptions, CubeSecureJsonData>({ fileName: 'datasources.yml' });

  // This test expects the provisioned datasource to use self-hosted deployment
  expect(ds.jsonData.deploymentType).toBe('self-hosted');

  const configPage = await createDataSourceConfigPage({ type: ds.type });
  await page.getByRole('textbox', { name: 'Cube API URL' }).fill(ds.jsonData.cubeApiUrl ?? '');
  await page.getByRole('radio', { name: 'Self-hosted (API Secret)' }).click();
  await page.getByRole('textbox', { name: 'API Secret' }).fill(ds.secureJsonData?.apiSecret ?? '');

  await expect(configPage.saveAndTest()).toBeOK();
});

test('"Save & test" should fail when configuration is invalid', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource<CubeDataSourceOptions, CubeSecureJsonData>({ fileName: 'datasources.yml' });
  const configPage = await createDataSourceConfigPage({ type: ds.type });
  // Leave Cube API URL empty to trigger validation error
  await page.getByRole('textbox', { name: 'Cube API URL' }).fill('');
  await expect(configPage.saveAndTest()).not.toBeOK();
  await expect(configPage).toHaveAlert('error', { hasText: 'Cube API URL is required' });
});
