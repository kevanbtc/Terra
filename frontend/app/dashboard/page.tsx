'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { 
  ChartBarIcon, 
  ShieldCheckIcon, 
  CurrencyDollarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

import { ReceiptsCard } from '@/components/dashboard/ReceiptsCard';
import { VaultMetricsCard } from '@/components/dashboard/VaultMetricsCard';
import { OracleStatusCard } from '@/components/dashboard/OracleStatusCard';
import { PortfolioChart } from '@/components/charts/PortfolioChart';
import { TransactionHistory } from '@/components/dashboard/TransactionHistory';
import { CarrierExposureChart } from '@/components/charts/CarrierExposureChart';

import { useCSVVault } from '@/hooks/useCSVVault';
import { useCSVOracle } from '@/hooks/useCSVOracle';
import { formatCurrency, formatPercent } from '@/utils/format';

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [selectedTimeframe, setSelectedTimeframe] = useState('7d');
  
  // Contract hooks
  const {
    vaultMetrics,
    userBalance,
    userRedemptions,
    carrierExposures,
    loading: vaultLoading
  } = useCSVVault();

  const {
    oracleData,
    isStale,
    attestorCount,
    threshold,
    loading: oracleLoading
  } = useCSVOracle();

  const isLoading = vaultLoading || oracleLoading;

  // Calculate key metrics
  const navPerToken = oracleData?.navPerToken || 0n;
  const totalSupply = oracleData?.totalSupply || 0n;
  const utilizationBps = oracleData?.utilizationBps || 0;
  const ltvBps = oracleData?.ltvBps || 0;

  const totalValue = Number(totalSupply * navPerToken / BigInt(1e18));
  const userValue = Number(userBalance * navPerToken / BigInt(1e18));

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <ShieldCheckIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600">
            Please connect your wallet to access the iYield Protocol dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                iYield Protocol Dashboard
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Insurance-backed Real World Assets
              </p>
            </div>
            
            {/* System Status */}
            <div className="flex items-center space-x-4">
              <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                isStale 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  isStale ? 'bg-red-500' : 'bg-green-500'
                }`} />
                {isStale ? 'Oracle Stale' : 'System Online'}
              </div>
              
              <div className="text-right">
                <div className="text-sm text-gray-500">Current NAV</div>
                <div className="text-lg font-semibold">
                  {formatCurrency(Number(navPerToken) / 1e18)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alert Banner */}
        {(isStale || utilizationBps > 9000) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6"
          >
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-2" />
              <div className="text-sm">
                {isStale && (
                  <span className="text-yellow-800 font-medium">
                    Oracle data is stale. Some metrics may not be current.
                  </span>
                )}
                {utilizationBps > 9000 && (
                  <span className="text-yellow-800 font-medium ml-2">
                    High vault utilization ({formatPercent(utilizationBps / 100)}). 
                    New deposits may be limited.
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* User Portfolio Value */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Your Portfolio</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(userValue)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {Number(userBalance) / 1e18} CSV
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <CurrencyDollarIcon className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </motion.div>

          {/* Total Value Locked */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Value Locked</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(totalValue)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {Number(totalSupply) / 1e18} CSV Total Supply
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <ChartBarIcon className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </motion.div>

          {/* Vault Utilization */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Vault Utilization</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatPercent(utilizationBps / 100)}
                </p>
                <div className="flex items-center mt-1">
                  {utilizationBps > 8000 ? (
                    <ArrowUpIcon className="h-4 w-4 text-red-500 mr-1" />
                  ) : (
                    <ArrowDownIcon className="h-4 w-4 text-green-500 mr-1" />
                  )}
                  <p className={`text-sm ${utilizationBps > 8000 ? 'text-red-600' : 'text-green-600'}`}>
                    {utilizationBps > 8000 ? 'High' : 'Healthy'}
                  </p>
                </div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <ChartBarIcon className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </motion.div>

          {/* LTV Ratio */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">LTV Ratio</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatPercent(ltvBps / 100)}
                </p>
                <div className="flex items-center mt-1">
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    ltvBps > 7000 ? 'bg-orange-500' : 'bg-green-500'
                  }`} />
                  <p className={`text-sm ${ltvBps > 7000 ? 'text-orange-600' : 'text-green-600'}`}>
                    {ltvBps > 7000 ? 'Near Limit' : 'Safe'}
                  </p>
                </div>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <ShieldCheckIcon className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Portfolio Chart */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Portfolio Performance
                  </h3>
                  <div className="flex space-x-2">
                    {['7d', '30d', '90d', '1y'].map((period) => (
                      <button
                        key={period}
                        onClick={() => setSelectedTimeframe(period)}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                          selectedTimeframe === period
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6">
                <PortfolioChart timeframe={selectedTimeframe} />
              </div>
            </div>

            {/* Carrier Exposure Chart */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Carrier Exposure
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Portfolio diversification across insurance carriers
                </p>
              </div>
              <div className="p-6">
                <CarrierExposureChart data={carrierExposures} />
              </div>
            </div>

            {/* Transaction History */}
            <TransactionHistory address={address} />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Oracle Status */}
            <OracleStatusCard 
              oracleData={oracleData}
              isStale={isStale}
              attestorCount={attestorCount}
              threshold={threshold}
            />

            {/* Receipts Card */}
            <ReceiptsCard />

            {/* Vault Metrics */}
            <VaultMetricsCard metrics={vaultMetrics} />

            {/* User Redemptions */}
            {userRedemptions.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Active Redemptions
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  {userRedemptions.map((redemption) => (
                    <div
                      key={redemption.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {formatCurrency(Number(redemption.valueAtRequest) / 1e6)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Requested {new Date(redemption.requestTime * 1000).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          redemption.processed ? 'text-green-600' : 'text-yellow-600'
                        }`}>
                          {redemption.processed ? 'Processed' : 'Pending'}
                        </p>
                        {!redemption.processed && (
                          <p className="text-xs text-gray-500">
                            Available in {Math.max(0, 7 - Math.floor((Date.now() / 1000 - redemption.requestTime) / 86400))} days
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}