import React, { ChangeEvent, useMemo } from 'react';
import { InlineField, Input, SecretInput, RadioButtonGroup, Alert, Combobox, ComboboxOption } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions, MySecureJsonData } from '../types';
import { useSqlDatasources } from '../hooks/useSqlDatasources';

// Constants
const FIELD_WIDTHS = {
  input: 60,
  label: 20,
} as const;

interface ConfigEditorProps extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> {}

export function ConfigEditor({ onOptionsChange, options }: ConfigEditorProps) {
  const { jsonData, secureJsonFields, secureJsonData } = options;
  const { sqlDatasources, loading: loadingSqlDatasources } = useSqlDatasources();

  // No default - user must explicitly select deployment type
  const deploymentType = jsonData.deploymentType;

  // Memoized datasource options for Combobox
  const sqlDatasourceOptions = useMemo(
    () =>
      sqlDatasources.map(({ label, value }) => ({
        label,
        value,
      })),
    [sqlDatasources]
  );

  const updateJsonData = (field: keyof MyDataSourceOptions, value: string | undefined) =>
    onOptionsChange({ ...options, jsonData: { ...jsonData, [field]: value } });

  const updateSecureData = (field: keyof MySecureJsonData, value: string) =>
    onOptionsChange({ ...options, secureJsonData: { [field]: value } });

  const resetApiKey = () =>
    onOptionsChange({
      ...options,
      secureJsonFields: { ...options.secureJsonFields, apiKey: false },
      secureJsonData: { ...options.secureJsonData, apiKey: '' },
    });

  const resetApiSecret = () =>
    onOptionsChange({
      ...options,
      secureJsonFields: { ...options.secureJsonFields, apiSecret: false },
      secureJsonData: { ...options.secureJsonData, apiSecret: '' },
    });

  const deploymentOptions = [
    { label: 'Cube Cloud (API Key)', value: 'cloud', description: 'For Cube Cloud deployments' },
    { label: 'Self-hosted (API Secret)', value: 'self-hosted', description: 'For self-hosted Cube instances' },
    {
      label: 'Self-hosted Dev Mode (No Auth)',
      value: 'self-hosted-dev',
      description: 'No authentication (CUBEJS_DEV_MODE=true)',
    },
  ];

  return (
    <>
      <InlineField
        labelWidth={FIELD_WIDTHS.label}
        label="Cube API URL"
        interactive
        tooltip="URL of your Cube API server"
      >
        <Input
          id="config-editor-cube-api-url"
          onChange={(e: ChangeEvent<HTMLInputElement>) => updateJsonData('cubeApiUrl', e.target.value)}
          value={jsonData.cubeApiUrl}
          placeholder="e.g. http://localhost:4000 or https://my-cube-api.com"
          width={FIELD_WIDTHS.input}
          required
        />
      </InlineField>

      <InlineField
        labelWidth={FIELD_WIDTHS.label}
        label="Deployment Type"
        interactive
        tooltip="Select your Cube deployment type"
      >
        <RadioButtonGroup
          options={deploymentOptions}
          value={deploymentType}
          onChange={(value) => updateJsonData('deploymentType', value)}
        />
      </InlineField>

      {deploymentType === 'cloud' && (
        <InlineField
          labelWidth={FIELD_WIDTHS.label}
          label="API Key"
          interactive
          tooltip="API key from your Cube Cloud dashboard"
        >
          <SecretInput
            id="config-editor-api-key"
            isConfigured={secureJsonFields.apiKey}
            value={secureJsonData?.apiKey}
            placeholder="Enter your Cube Cloud API key"
            width={FIELD_WIDTHS.input}
            onReset={resetApiKey}
            onChange={(e: ChangeEvent<HTMLInputElement>) => updateSecureData('apiKey', e.target.value)}
          />
        </InlineField>
      )}

      {deploymentType === 'self-hosted' && (
        <InlineField
          labelWidth={FIELD_WIDTHS.label}
          label="API Secret"
          interactive
          tooltip="CUBEJS_API_SECRET value from your Cube deployment"
        >
          <SecretInput
            id="config-editor-api-secret"
            isConfigured={secureJsonFields.apiSecret}
            value={secureJsonData?.apiSecret}
            placeholder="Enter your CUBEJS_API_SECRET"
            width={FIELD_WIDTHS.input}
            onReset={resetApiSecret}
            onChange={(e: ChangeEvent<HTMLInputElement>) => updateSecureData('apiSecret', e.target.value)}
          />
        </InlineField>
      )}

      {deploymentType === 'self-hosted-dev' && (
        <Alert severity="warning" title="Development Mode">
          No authentication will be sent. Only use this with CUBEJS_DEV_MODE=true
        </Alert>
      )}

      <InlineField
        labelWidth={FIELD_WIDTHS.label}
        label="SQL Datasource"
        interactive
        tooltip='Choose which SQL datasource to open when clicking "Edit SQL in Explore"'
      >
        <Combobox
          options={sqlDatasourceOptions}
          value={jsonData.exploreSqlDatasourceUid}
          placeholder={loadingSqlDatasources ? 'Loading datasources...' : 'Select SQL datasource'}
          onChange={(option: ComboboxOption<string> | null) =>
            updateJsonData('exploreSqlDatasourceUid', option?.value)
          }
          width={FIELD_WIDTHS.input}
          loading={loadingSqlDatasources}
        />
      </InlineField>
    </>
  );
}
