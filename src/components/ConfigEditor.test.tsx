import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { setup } from 'testUtils';
import { ConfigEditor } from './ConfigEditor';
import { MyDataSourceOptions, MySecureJsonData } from '../types';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';

const createMockEditorProps = (
  overrides?: Partial<DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData>>
): DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> => {
  return {
    options: {
      id: 1,
      uid: 'test-uid',
      orgId: 1,
      name: 'Test Cube',
      type: 'cube-datasource',
      typeName: 'Cube',
      access: 'proxy',
      url: '',
      user: '',
      database: '',
      basicAuth: false,
      basicAuthUser: '',
      isDefault: false,
      jsonData: {
        cubeApiUrl: 'http://localhost:4000',
        deploymentType: 'self-hosted-dev',
      },
      secureJsonFields: {
        apiKey: false,
        apiSecret: false,
      },
      readOnly: false,
      withCredentials: false,
      version: 1,
      ...overrides?.options,
    },
    onOptionsChange: jest.fn(),
    ...overrides,
  } as DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData>;
};

describe('ConfigEditor', () => {
  describe('Cube API URL field', () => {
    it('should render Cube API URL input field', () => {
      const props = createMockEditorProps();
      setup(<ConfigEditor {...props} />);

      expect(screen.getByLabelText('Cube API URL')).toBeInTheDocument();
    });

    it('should display existing Cube API URL value', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'https://my-cube-api.com',
            deploymentType: 'self-hosted-dev',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      const urlInput = screen.getByLabelText('Cube API URL') as HTMLInputElement;
      expect(urlInput.value).toBe('https://my-cube-api.com');
    });

    it('should call onOptionsChange when URL is modified', () => {
      const props = createMockEditorProps();
      setup(<ConfigEditor {...props} />);

      const urlInput = screen.getByLabelText('Cube API URL');
      fireEvent.change(urlInput, { target: { value: 'http://new-url:4000' } });

      expect(props.onOptionsChange).toHaveBeenCalledWith({
        ...props.options,
        jsonData: {
          ...props.options.jsonData,
          cubeApiUrl: 'http://new-url:4000',
        },
      });
    });
  });

  describe('Deployment type selection', () => {
    it('should render deployment type radio buttons', () => {
      const props = createMockEditorProps();
      setup(<ConfigEditor {...props} />);

      expect(screen.getByText('Cube Cloud (API Key)')).toBeInTheDocument();
      expect(screen.getByText('Self-hosted (API Secret)')).toBeInTheDocument();
      expect(screen.getByText('Self-hosted Dev Mode (No Auth)')).toBeInTheDocument();
    });

    it('should show no auth fields when deploymentType is not set', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            // deploymentType not set
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      // Should not show any auth-specific fields or warnings when no deployment type is selected
      expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('API Secret')).not.toBeInTheDocument();
      expect(
        screen.queryByText('No authentication will be sent. Only use this with CUBEJS_DEV_MODE=true')
      ).not.toBeInTheDocument();
    });

    it('should call onOptionsChange when deployment type changes', () => {
      const props = createMockEditorProps();
      setup(<ConfigEditor {...props} />);

      const cloudButton = screen.getByText('Cube Cloud (API Key)');
      fireEvent.click(cloudButton);

      expect(props.onOptionsChange).toHaveBeenCalledWith({
        ...props.options,
        jsonData: {
          ...props.options.jsonData,
          deploymentType: 'cloud',
        },
      });
    });
  });

  describe('Cloud authentication (API Key)', () => {
    it('should show API Key field when cloud authentication is selected', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'cloud',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    });

    it('should NOT show API Key field when cloud authentication is not selected', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    });

    it('should show "configured" state when API key is already set', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'cloud',
          },
          secureJsonFields: {
            apiKey: true,
            apiSecret: false,
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      // SecretInput component shows "configured" when isConfigured is true
      const apiKeyInput = screen.getByPlaceholderText('Enter your Cube Cloud API key') as HTMLInputElement;
      expect(apiKeyInput.value).toBe('configured');
      expect(apiKeyInput.disabled).toBe(true);
    });

    it('should call onOptionsChange when API key is entered', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'cloud',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      const apiKeyInput = screen.getByPlaceholderText('Enter your Cube Cloud API key');
      fireEvent.change(apiKeyInput, { target: { value: 'my-api-key-123' } });

      expect(props.onOptionsChange).toHaveBeenCalledWith({
        ...props.options,
        secureJsonData: {
          apiKey: 'my-api-key-123',
        },
      });
    });

    it('should reset API key when reset button is clicked', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'cloud',
          },
          secureJsonFields: {
            apiKey: true,
            apiSecret: false,
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);

      expect(props.onOptionsChange).toHaveBeenCalledWith({
        ...props.options,
        secureJsonFields: {
          ...props.options.secureJsonFields,
          apiKey: false,
        },
        secureJsonData: {
          ...props.options.secureJsonData,
          apiKey: '',
        },
      });
    });
  });

  describe('Self-hosted authentication (API Secret)', () => {
    it('should show API Secret field when self-hosted authentication is selected', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      expect(screen.getByLabelText('API Secret')).toBeInTheDocument();
    });

    it('should NOT show API Secret field when self-hosted authentication is not selected', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'cloud',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      expect(screen.queryByLabelText('API Secret')).not.toBeInTheDocument();
    });

    it('should show "configured" state when API secret is already set', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted',
          },
          secureJsonFields: {
            apiKey: false,
            apiSecret: true,
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      // SecretInput component shows "configured" when isConfigured is true
      const apiSecretInput = screen.getByPlaceholderText('Enter your CUBEJS_API_SECRET') as HTMLInputElement;
      expect(apiSecretInput.value).toBe('configured');
      expect(apiSecretInput.disabled).toBe(true);
    });

    it('should call onOptionsChange when API secret is entered', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      const apiSecretInput = screen.getByPlaceholderText('Enter your CUBEJS_API_SECRET');
      fireEvent.change(apiSecretInput, { target: { value: 'my-api-secret-456' } });

      expect(props.onOptionsChange).toHaveBeenCalledWith({
        ...props.options,
        secureJsonData: {
          apiSecret: 'my-api-secret-456',
        },
      });
    });

    it('should reset API secret when reset button is clicked', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted',
          },
          secureJsonFields: {
            apiKey: false,
            apiSecret: true,
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);

      expect(props.onOptionsChange).toHaveBeenCalledWith({
        ...props.options,
        secureJsonFields: {
          ...props.options.secureJsonFields,
          apiSecret: false,
        },
        secureJsonData: {
          ...props.options.secureJsonData,
          apiSecret: '',
        },
      });
    });
  });

  describe('Self-hosted Development (No authentication)', () => {
    it('should show warning message when "self-hosted-dev" deployment is selected', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted-dev',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      expect(
        screen.getByText('No authentication will be sent. Only use this with CUBEJS_DEV_MODE=true')
      ).toBeInTheDocument();
    });

    it('should NOT show API Key or API Secret fields when "self-hosted-dev" is selected', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted-dev',
          },
        },
      });
      setup(<ConfigEditor {...props} />);

      expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('API Secret')).not.toBeInTheDocument();
    });
  });

  describe('Integration: Switching deployment types', () => {
    it('should hide API Key and show API Secret when switching from cloud to self-hosted', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'cloud',
          },
        },
      });
      const { rerender } = setup(<ConfigEditor {...props} />);

      // Initially shows API Key
      expect(screen.getByLabelText('API Key')).toBeInTheDocument();
      expect(screen.queryByLabelText('API Secret')).not.toBeInTheDocument();

      // Switch to self-hosted
      const updatedProps = createMockEditorProps({
        options: {
          ...props.options,
          jsonData: {
            ...props.options.jsonData,
            deploymentType: 'self-hosted',
          },
        },
        onOptionsChange: props.onOptionsChange,
      });
      rerender(<ConfigEditor {...updatedProps} />);

      // Now shows API Secret instead
      expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
      expect(screen.getByLabelText('API Secret')).toBeInTheDocument();
    });

    it('should hide all auth fields when switching to "self-hosted-dev"', () => {
      const props = createMockEditorProps({
        options: {
          ...createMockEditorProps().options,
          jsonData: {
            cubeApiUrl: 'http://localhost:4000',
            deploymentType: 'self-hosted',
          },
        },
      });
      const { rerender } = setup(<ConfigEditor {...props} />);

      // Initially shows API Secret
      expect(screen.getByLabelText('API Secret')).toBeInTheDocument();

      // Switch to self-hosted-dev
      const updatedProps = createMockEditorProps({
        options: {
          ...props.options,
          jsonData: {
            ...props.options.jsonData,
            deploymentType: 'self-hosted-dev',
          },
        },
        onOptionsChange: props.onOptionsChange,
      });
      rerender(<ConfigEditor {...updatedProps} />);

      // Shows warning instead of auth fields
      expect(screen.queryByLabelText('API Secret')).not.toBeInTheDocument();
      expect(
        screen.getByText('No authentication will be sent. Only use this with CUBEJS_DEV_MODE=true')
      ).toBeInTheDocument();
    });
  });
});
