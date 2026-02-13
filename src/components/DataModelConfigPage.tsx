import React from 'react';
import { PluginConfigPageProps, PluginMeta } from '@grafana/data';

export function DataModelConfigPage({ plugin }: PluginConfigPageProps<PluginMeta>) {
  return (
    <div>
      <h3>Data Model</h3>
      <p>This page will let you generate Cube data models from your database schema.</p>
      <p>Plugin ID: {plugin.meta.id}</p>
    </div>
  );
}
