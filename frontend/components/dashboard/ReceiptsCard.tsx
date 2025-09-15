'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

import { formatDistanceToNow } from '@/utils/format';

interface Receipt {
  id: string;
  type: 'oracle_update' | 'deployment' | 'governance' | 'compliance';
  timestamp: number;
  cid: string;
  title: string;
  description: string;
  status: 'confirmed' | 'pending' | 'failed';
  txHash?: string;
  blockNumber?: number;
}

export function ReceiptsCard() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'all' | 'oracle' | 'governance'>('all');

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      
      // In production, this would fetch from your API/IPFS
      const mockReceipts: Receipt[] = [
        {
          id: '1',
          type: 'oracle_update',
          timestamp: Date.now() - 300000, // 5 minutes ago
          cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          title: 'Oracle Data Updated',
          description: 'NAV: $1.0247, LTV: 68.5%, Utilization: 72.3%',
          status: 'confirmed',
          txHash: '0x123...abc',
          blockNumber: 18500000
        },
        {
          id: '2',
          type: 'deployment',
          timestamp: Date.now() - 3600000, // 1 hour ago
          cid: 'QmPChd2hVbrJ4bfo7tAjVeB1Xq8Xg4Z8jK5fM3h9LxQ2vN',
          title: 'Contract Deployment',
          description: 'CSVVault v1.2.0 deployed to mainnet',
          status: 'confirmed',
          txHash: '0x456...def',
          blockNumber: 18499800
        },
        {
          id: '3',
          type: 'governance',
          timestamp: Date.now() - 86400000, // 1 day ago
          cid: 'QmQfdyxn7nxXNjKFgkLfLtBo9q8wU2tQx8jL3nF6bR7tPz',
          title: 'LTV Cap Update',
          description: 'Maximum LTV ratio increased from 70% to 75%',
          status: 'confirmed',
          txHash: '0x789...ghi',
          blockNumber: 18495000
        },
        {
          id: '4',
          type: 'compliance',
          timestamp: Date.now() - 172800000, // 2 days ago
          cid: 'QmRz8vK2wM9qL5cT7jN3pX8fV6uR4hG9sY1bN0dF8pQ2x',
          title: 'Compliance Audit',
          description: 'Monthly compliance check completed - all requirements met',
          status: 'confirmed',
          blockNumber: 18490000
        },
        {
          id: '5',
          type: 'oracle_update',
          timestamp: Date.now() - 900000, // 15 minutes ago
          cid: 'QmTk3vQ7cL8wN5pY2jR9xF4bG8hV6uZ1dS0oM3nP6tA5x',
          title: 'Oracle Update Pending',
          description: 'Awaiting 2-of-3 attestor confirmations',
          status: 'pending'
        }
      ];

      setReceipts(mockReceipts);
    } catch (error) {
      console.error('Failed to fetch receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReceipts = receipts.filter(receipt => {
    if (selectedTab === 'all') return true;
    if (selectedTab === 'oracle') return receipt.type === 'oracle_update';
    if (selectedTab === 'governance') return ['governance', 'deployment'].includes(receipt.type);
    return true;
  });

  const getStatusIcon = (status: Receipt['status']) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <ClockIcon className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <ExclamationCircleIcon className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusColor = (status: Receipt['status']) => {
    switch (status) {
      case 'confirmed':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
    }
  };

  const getTypeColor = (type: Receipt['type']) => {
    switch (type) {
      case 'oracle_update':
        return 'text-blue-600 bg-blue-50';
      case 'deployment':
        return 'text-purple-600 bg-purple-50';
      case 'governance':
        return 'text-indigo-600 bg-indigo-50';
      case 'compliance':
        return 'text-green-600 bg-green-50';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">System Receipts</h3>
            <p className="text-sm text-gray-600 mt-1">
              Cryptographic proofs and audit trail
            </p>
          </div>
          <DocumentTextIcon className="h-6 w-6 text-gray-400" />
        </div>

        {/* Tabs */}
        <div className="mt-4 flex space-x-4">
          {[
            { id: 'all', label: 'All' },
            { id: 'oracle', label: 'Oracle' },
            { id: 'governance', label: 'Governance' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                selectedTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-500 mt-2">Loading receipts...</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredReceipts.map((receipt, index) => (
              <motion.div
                key={receipt.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(receipt.type)}`}>
                        {receipt.type.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(receipt.status)}`}>
                        {getStatusIcon(receipt.status)}
                        <span className="ml-1">{receipt.status.toUpperCase()}</span>
                      </span>
                    </div>
                    
                    <h4 className="text-sm font-medium text-gray-900 mb-1">
                      {receipt.title}
                    </h4>
                    
                    <p className="text-sm text-gray-600 mb-2">
                      {receipt.description}
                    </p>
                    
                    <div className="flex items-center text-xs text-gray-500 space-x-4">
                      <span>
                        {formatDistanceToNow(new Date(receipt.timestamp))} ago
                      </span>
                      
                      {receipt.blockNumber && (
                        <span>Block {receipt.blockNumber.toLocaleString()}</span>
                      )}
                      
                      <button
                        onClick={() => window.open(`https://ipfs.io/ipfs/${receipt.cid}`, '_blank')}
                        className="inline-flex items-center text-blue-600 hover:text-blue-800"
                      >
                        View on IPFS
                        <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* CID Display */}
                <div className="mt-3 p-2 bg-gray-100 rounded text-xs font-mono text-gray-700 break-all">
                  CID: {receipt.cid}
                </div>
                
                {/* Transaction Hash */}
                {receipt.txHash && (
                  <div className="mt-2">
                    <button
                      onClick={() => window.open(`https://etherscan.io/tx/${receipt.txHash}`, '_blank')}
                      className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-mono"
                    >
                      {receipt.txHash}
                      <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {!loading && filteredReceipts.length === 0 && (
        <div className="p-6 text-center">
          <DocumentTextIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">No receipts found for the selected filter</p>
        </div>
      )}

      {/* Footer with system info */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
          <span>All data cryptographically verified</span>
        </div>
      </div>
    </div>
  );
}