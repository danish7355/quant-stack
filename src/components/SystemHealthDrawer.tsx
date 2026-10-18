import React from 'react';
import { Drawer } from './ui/Drawer.js';
import { SystemHealthPage } from './SystemHealth.js';
import { SystemHealth } from '../types.js';

interface SystemHealthDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  health?: SystemHealth;
}

export function SystemHealthDrawer({
  isOpen,
  onClose,
  health,
}: SystemHealthDrawerProps) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="System Health & Subsystem Grid"
      description="Real-time monitoring of AutoTrader daemon, OMS reconciliation, and WebSocket feeds"
      width="2xl"
    >
      <div className="p-1">
        <SystemHealthPage initialHealth={health} />
      </div>
    </Drawer>
  );
}
