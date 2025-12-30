import { test, expect } from '@grafana/plugin-e2e';

test('smoke: should render query editor', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  // Check that the Dimensions and Measures MultiSelect components are accessible and visible
  await expect(panelEditPage.getQueryEditorRow('A').getByRole('combobox', { name: 'Select dimensions...' })).toBeVisible();
  await expect(panelEditPage.getQueryEditorRow('A').getByRole('combobox', { name: 'Select measures...' })).toBeVisible();
});

test.skip('should trigger new query when Constant field is changed', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  // This test needs to be redesigned for the new UI - skipping for now
});

test('should show SQL preview when measures are selected', async ({
  panelEditPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  // Wait for metadata to load by checking that the Measures component is visible
  const measuresSelect = panelEditPage.getQueryEditorRow('A').getByRole('combobox', { name: 'Select measures...' });
  await expect(measuresSelect).toBeVisible({ timeout: 10000 });

  // Click on the Measures MultiSelect to open it
  await measuresSelect.click();

  // Wait for dropdown options to appear and select the first available measure
  // Look for dropdown options in the body (they may be rendered outside the query editor row)
  const firstMeasureOption = page.locator('[role="option"]').first();
  await expect(firstMeasureOption).toBeVisible({ timeout: 5000 });
  await firstMeasureOption.click();

  // Wait for SQL preview to appear - look for SELECT in the generated SQL area
  await expect(
    panelEditPage.getQueryEditorRow('A').locator('[aria-label="Generated SQL query"]').filter({ hasText: 'SELECT' })
  ).toBeVisible({ timeout: 10000 });
});

test('should not show SQL preview when no measures are selected', async ({
  panelEditPage,
  readProvisionedDataSource,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);

  // Wait for the component to load by checking that the Measures component is visible
  await expect(panelEditPage.getQueryEditorRow('A').getByRole('combobox', { name: 'Select measures...' })).toBeVisible({ timeout: 10000 });

  // Wait a moment to ensure no SQL preview appears when nothing is selected
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Verify that no SQL preview is shown - look specifically for the generated SQL area
  await expect(panelEditPage.getQueryEditorRow('A').locator('[aria-label="Generated SQL query"]')).not.toBeVisible();
});
