# 🏛️ iYield Protocol - Terra Repository

**The first insurance-backed RWA tokenization protocol with enterprise-grade infrastructure**

[![CI/CD Pipeline](https://github.com/kevanbtc/Terra/actions/workflows/ci.yml/badge.svg)](https://github.com/kevanbtc/Terra/actions)
[![Security Analysis](https://github.com/kevanbtc/Terra/actions/workflows/slither.yml/badge.svg)](https://github.com/kevanbtc/Terra/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 Overview

iYield Protocol enables institutional-grade tokenization of insurance portfolios through Captive Securities Vehicles (CSV). Our system provides:

- **Insurance-Backed Tokens**: ERC-20 tokens representing fractional ownership of insurance portfolios
- **Oracle-Verified NAV**: Real-time portfolio valuation with cryptographic attestation  
- **Compliance Integration**: Built-in Rule 144, Reg D, and Reg S compliance checks
- **Enterprise Infrastructure**: Production-ready Kubernetes, monitoring, and ops automation

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │  Smart Contracts │    │ Infrastructure  │
│                 │    │                  │    │                 │
│ • Dashboard     │◄──►│ • ERCRWACSV      │◄──►│ • Kubernetes    │
│ • Wallet Conn   │    │ • CSVVault       │    │ • Terraform     │
│ • Charts        │    │ • CSVOracle      │    │ • Monitoring    │
│ • Receipts      │    │ • Compliance     │    │ • CI/CD         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Oracle Network   │
                    │                  │
                    │ • 2-of-N Sigs    │
                    │ • IPFS Storage   │
                    │ • NAV Updates    │
                    └──────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- AWS CLI (for infrastructure)
- Terraform (for infrastructure)
- kubectl (for Kubernetes)

### Local Development

```bash
# Clone repository
git clone https://github.com/kevanbtc/Terra.git
cd Terra

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Compile contracts
npm run compile

# Run tests
npm run test
npm run coverage

# Start local blockchain
npm run node

# Deploy to local network
npm run deploy:local

# Start frontend development server
cd frontend
npm install
npm run dev
```

### Smart Contract Deployment

```bash
# Deploy to Sepolia testnet
npm run deploy:sepolia

# Verify contracts
npm run verify:sepolia

# Deploy to mainnet (requires multisig)
npm run deploy:mainnet
```

## 📂 Repository Structure

```
Terra/
├── contracts/              # Smart contracts
│   ├── core/               # Core protocol contracts
│   ├── interfaces/         # Contract interfaces
│   └── test/               # Test contracts
├── frontend/               # Next.js frontend application
│   ├── app/                # App router pages
│   ├── components/         # React components
│   └── hooks/              # Custom hooks
├── test/                   # Comprehensive test suite
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── mocks/              # Mock contracts
├── infra/                  # Infrastructure as Code
│   ├── terraform/          # AWS infrastructure
│   ├── k8s/                # Kubernetes manifests
│   └── monitoring/         # Prometheus/Grafana configs
├── docs/                   # Documentation
│   ├── ops-playbook.md     # Operations manual
│   ├── incident-playbook.md # Incident response
│   └── deployment-checklist.md # Deployment guide
└── .github/                # CI/CD workflows
    └── workflows/          # GitHub Actions
```

## 🔐 Smart Contracts

### Core Contracts

- **`ERCRWACSV.sol`**: ERC-20 token representing CSV shares with compliance integration
- **`CSVVault.sol`**: Deposit/withdrawal vault with pull-payment redemptions  
- **`CSVOracle.sol`**: Multi-attestor oracle with EIP-712 signature verification
- **`GovControlled.sol`**: Base governance contract with roles and pause functionality

### Key Features

- **Multi-signature governance** via Gnosis Safe integration
- **2-of-N oracle attestation** with anti-replay protection
- **Carrier concentration limits** and vintage validation
- **Pull-payment redemptions** with delay for security
- **Emergency pause** functionality for guardian protection
- **Comprehensive events** for monitoring and compliance

## 🎛️ Infrastructure

### Production Environment

Our infrastructure provides enterprise-grade reliability:

- **Multi-region AWS deployment** with failover capability
- **Kubernetes orchestration** with auto-scaling
- **Prometheus monitoring** with Grafana dashboards
- **ELK stack logging** for audit trails
- **Sealed secrets** management with AWS integration
- **Blue/green deployments** with automatic rollback

### Monitoring & Observability  

- **Real-time metrics**: Oracle freshness, vault utilization, LTV ratios
- **Alert management**: PagerDuty integration for critical incidents
- **Audit trails**: All operations logged with IPFS anchoring
- **Performance tracking**: Response times, error rates, availability

## 🧪 Testing

Comprehensive test coverage across all layers:

```bash
# Unit tests
npm run test

# Integration tests  
npm run test:integration

# Coverage report
npm run coverage

# Gas analysis
npm run gas-report

# Security analysis
npm run slither
```

### Test Categories

- **Unit tests**: Individual contract function testing
- **Integration tests**: Multi-contract workflow testing  
- **Invariant tests**: Property-based testing with Foundry
- **Compliance tests**: Rule 144/Reg D/Reg S validation
- **Oracle tests**: Multi-attestor signature verification
- **Frontend tests**: Component and E2E testing

## 🔒 Security

Security is paramount in our design:

- **Multi-layered access control** with role-based permissions
- **Time-locked governance** for parameter updates
- **Circuit breakers** for emergency stops
- **Oracle manipulation resistance** through multiple attestors
- **Reentrancy protection** on all state-changing functions
- **Comprehensive security testing** including fuzzing

### Security Audits

- Static analysis with Slither and MythX
- Manual security reviews by protocol security team
- External audit by [Audit Firm] (planned)
- Bug bounty program on Immunefi

## 📈 Oracle System

Our oracle provides institutional-grade data verification:

- **Multi-source data aggregation** from insurance portfolio systems
- **Cryptographic attestation** using EIP-712 signatures
- **2-of-N threshold signatures** preventing single points of failure  
- **Anti-replay protection** with nonces and timestamps
- **IPFS data storage** for transparency and auditability
- **Freshness validation** with configurable timeout

### Oracle Data Structure

```solidity
struct OracleData {
    uint256 navPerToken;      // Net Asset Value per token
    uint256 totalSupply;      // Current token supply
    uint256 utilizationBps;   // Vault utilization (basis points)
    uint256 ltvBps;          // Loan-to-value ratio (basis points)  
    uint256 timestamp;        // Data timestamp
    string dataCID;          // IPFS content identifier
    uint256 nonce;           // Anti-replay nonce
}
```

## 🏛️ Governance

Protocol governance follows institutional standards:

- **Gnosis Safe multisig** for governance and guardian roles
- **Time-locked execution** for parameter changes
- **Emergency pause powers** for guardian protection
- **Transparent voting** through on-chain proposals
- **Parameter bounds** preventing dangerous configurations

### Governance Roles

- **Governor**: Protocol upgrades, parameter updates (multisig)
- **Guardian**: Emergency pause, security responses (multisig)  
- **Operator**: Day-to-day operations (automated/vault)
- **Oracle**: Data attestation (distributed validators)

## 🔄 Compliance

Built-in regulatory compliance:

- **Rule 144 lockups** with automatic release scheduling
- **Reg D private placement** investor verification
- **Reg S offshore** transaction restrictions  
- **Transfer restrictions** based on jurisdiction
- **Audit trails** for regulatory reporting

## 📊 Monitoring & Alerts

Real-time operational monitoring:

### Key Metrics
- Oracle data freshness and attestor health
- Vault utilization and liquidity levels
- LTV ratios and concentration limits
- Transaction success rates and gas costs
- System uptime and performance metrics

### Alert Thresholds
- **P0 (Critical)**: System pause, oracle stale >2h, security breach
- **P1 (High)**: High utilization >85%, RPC failures, deploy issues
- **P2 (Medium)**: Compliance violations, performance degradation

## 🚢 Deployment

### Environments

- **Local**: Hardhat network for development
- **Staging**: Sepolia testnet for integration testing  
- **Production**: Ethereum mainnet with full infrastructure

### Deployment Process

1. **Pre-deployment validation** (tests, security, gas optimization)
2. **Staging deployment** with full integration testing
3. **Production deployment** via multisig with monitoring
4. **Post-deployment verification** and smoke testing

See [deployment checklist](docs/deployment-checklist.md) for detailed procedures.

## 📚 Documentation

Comprehensive documentation for all stakeholders:

- **[Operations Playbook](docs/ops-playbook.md)**: Day-to-day operations and procedures
- **[Incident Response](docs/incident-playbook.md)**: Emergency response procedures  
- **[Deployment Guide](docs/deployment-checklist.md)**: Step-by-step deployment
- **API Documentation**: Auto-generated from contract natspec

## 🤝 Contributing

We welcome contributions from the community:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- All code must pass tests and security analysis
- Follow existing code style and conventions
- Include comprehensive tests for new features
- Update documentation for user-facing changes
- Security-critical changes require additional review

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Website**: https://iyield.finance
- **Documentation**: https://docs.iyield.finance  
- **Twitter**: [@iYieldProtocol](https://twitter.com/iYieldProtocol)
- **Discord**: [iYield Community](https://discord.gg/iyield)
- **Bug Reports**: [GitHub Issues](https://github.com/kevanbtc/Terra/issues)

## ⚠️ Disclaimer

This protocol handles real financial assets and is intended for institutional use. Please conduct thorough due diligence and consider the risks before participating. Smart contracts are immutable once deployed and may contain bugs despite extensive testing.

---

**Built with ❤️ by the iYield Protocol team**

*Powering the future of institutional DeFi*