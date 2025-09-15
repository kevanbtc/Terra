# iYield Protocol Deployment Checklist

## 🚀 Pre-Deployment Checklist

### Code Quality & Security
- [ ] **Code Review**: All changes reviewed by 2+ engineers
- [ ] **Unit Tests**: >95% test coverage maintained
- [ ] **Integration Tests**: All integration tests passing
- [ ] **Gas Optimization**: Gas costs reviewed and optimized
- [ ] **Slither Analysis**: No high/critical security issues
- [ ] **MythX Analysis**: Security analysis completed (mainnet only)
- [ ] **Manual Security Review**: Security team sign-off (major changes)

### Contract Validation
- [ ] **Interface Compatibility**: No breaking changes to public interfaces
- [ ] **Storage Layout**: Storage slots not corrupted for upgradeable contracts
- [ ] **Initialization**: Proper initialization for new contracts/upgrades
- [ ] **Access Controls**: Role assignments verified
- [ ] **Event Emissions**: All state changes emit appropriate events
- [ ] **Custom Errors**: Using custom errors instead of string reverts
- [ ] **Reentrancy Guards**: Applied where needed

### Infrastructure Readiness
- [ ] **Environment Config**: All environment variables set correctly
- [ ] **Secrets Management**: All secrets properly stored in AWS Secrets Manager
- [ ] **Database Migrations**: Database schema up-to-date
- [ ] **Monitoring**: Metrics and alerts configured
- [ ] **Grafana Dashboards**: Updated with new contract metrics
- [ ] **DNS/Load Balancer**: Infrastructure routing configured

### Documentation
- [ ] **API Documentation**: Contract interfaces documented
- [ ] **Deployment Guide**: Step-by-step deployment instructions
- [ ] **Changelog**: Release notes prepared
- [ ] **Incident Response**: Runbooks updated for new features
- [ ] **User Documentation**: Frontend features documented

---

## 🏗️ Staging Deployment

### Pre-Staging
- [ ] **Environment**: Staging environment is clean and updated
- [ ] **Test Data**: Appropriate test data available
- [ ] **Rollback Plan**: Clear rollback procedure defined

### Staging Deployment Steps
1. **Deploy Contracts to Sepolia/Goerli**
   ```bash
   cd contracts
   npx hardhat deploy --network sepolia
   npx hardhat verify --network sepolia $CONTRACT_ADDRESS
   ```
   - [ ] Contracts deployed successfully
   - [ ] Contract verification completed
   - [ ] Deployment addresses recorded

2. **Update Frontend Configuration**
   ```bash
   cd frontend
   npm run build:staging
   docker build -t iyield/frontend:staging .
   ```
   - [ ] Frontend build successful
   - [ ] Docker image created
   - [ ] Environment config updated

3. **Deploy to Kubernetes Staging**
   ```bash
   kubectl set image deployment/iyield-frontend frontend=iyield/frontend:staging -n iyield-staging
   kubectl rollout status deployment/iyield-frontend -n iyield-staging
   ```
   - [ ] K8s deployment successful
   - [ ] All pods healthy
   - [ ] Services accessible

### Staging Validation
- [ ] **Smoke Tests**: Basic functionality working
- [ ] **End-to-End Tests**: Full user workflows tested
- [ ] **Performance Tests**: Response times acceptable
- [ ] **Security Tests**: Basic security validation
- [ ] **Oracle Integration**: Oracle data updating correctly
- [ ] **Database Connectivity**: All data operations working
- [ ] **Monitoring**: Metrics being collected properly

---

## 🎯 Production Deployment

### Pre-Production Final Checks
- [ ] **Staging Success**: All staging tests passed
- [ ] **Team Approval**: Deployment approved by team lead
- [ ] **Change Control**: Deployment scheduled and communicated
- [ ] **Rollback Plan**: Confirmed rollback procedure
- [ ] **On-call Coverage**: Engineers available for monitoring
- [ ] **Maintenance Window**: Users notified if downtime expected

### Production Deployment Steps

#### 1. Database Migrations (if required)
```bash
# Create backup before migration
aws rds create-db-snapshot \
  --db-instance-identifier iyield-oracle-db \
  --db-snapshot-identifier pre-deploy-$(date +%Y%m%d-%H%M%S)

# Run migrations
kubectl run db-migrate --rm -it --image=iyield/oracle:latest \
  --restart=Never -n iyield -- npm run migrate
```
- [ ] Pre-migration backup created
- [ ] Migrations executed successfully
- [ ] Database integrity verified

#### 2. Contract Deployment
```bash
# Deploy to mainnet (requires multisig)
cd contracts
npx hardhat deploy --network mainnet
```
- [ ] Contracts compiled without warnings
- [ ] Gas estimates reviewed and approved
- [ ] Deployment transaction submitted to Safe
- [ ] Required signatures collected
- [ ] Contracts deployed to mainnet
- [ ] Contract verification completed on Etherscan
- [ ] Deployment addresses updated in config

#### 3. Oracle Configuration Update
```bash
# Update oracle with new contract addresses
kubectl patch configmap iyield-config -n iyield \
  --patch='{"data":{"csv-vault-address":"'$NEW_VAULT_ADDRESS'"}}'

kubectl rollout restart deployment/iyield-oracle -n iyield
```
- [ ] Configuration updated
- [ ] Oracle pods restarted
- [ ] Oracle connecting to new contracts
- [ ] First attestation successful

#### 4. Frontend Deployment
```bash
# Build production frontend
cd frontend
npm run build:production
docker build -t ghcr.io/kevanbtc/iyield-frontend:main .
docker push ghcr.io/kevanbtc/iyield-frontend:main

# Deploy to production K8s
kubectl set image deployment/iyield-frontend \
  frontend=ghcr.io/kevanbtc/iyield-frontend:main -n iyield
kubectl rollout status deployment/iyield-frontend -n iyield --timeout=600s
```
- [ ] Production build created
- [ ] Docker image pushed to registry
- [ ] K8s deployment updated
- [ ] All pods running and healthy
- [ ] Load balancer routing traffic

#### 5. DNS/CDN Updates (if required)
- [ ] DNS records updated
- [ ] CDN cache cleared
- [ ] SSL certificates valid

### Post-Deployment Validation

#### Immediate Checks (0-5 minutes)
- [ ] **Health Endpoints**: All health checks passing
- [ ] **Pod Status**: All pods running without restarts
- [ ] **Database Connections**: Oracle connected to database
- [ ] **Contract Interactions**: Basic contract calls working
- [ ] **Frontend Loading**: Website accessible and loading

#### Short-term Monitoring (5-30 minutes)
- [ ] **Oracle Data Updates**: New oracle data being submitted
- [ ] **User Transactions**: Sample user transactions working
- [ ] **Error Rates**: Error rates within normal bounds
- [ ] **Performance**: Response times acceptable
- [ ] **Metrics Collection**: Prometheus scraping new metrics

#### Extended Monitoring (30+ minutes)
- [ ] **Business Logic**: All major features functioning
- [ ] **Compliance**: Compliance rules being enforced
- [ ] **Vault Operations**: Deposits/withdrawals working
- [ ] **Guardian Functions**: Pause/unpause capabilities tested
- [ ] **Grafana Dashboards**: All dashboards showing data

---

## 🔄 Rollback Procedures

### When to Rollback
- Critical functionality broken
- Security vulnerability discovered
- Performance severely degraded
- Data corruption detected

### Rollback Steps

#### 1. Frontend Rollback
```bash
# Rollback to previous image
kubectl rollout undo deployment/iyield-frontend -n iyield
kubectl rollout status deployment/iyield-frontend -n iyield
```

#### 2. Oracle Rollback
```bash
# Revert configuration
kubectl patch configmap iyield-config -n iyield \
  --patch='{"data":{"csv-vault-address":"'$PREVIOUS_VAULT_ADDRESS'"}}'
kubectl rollout restart deployment/iyield-oracle -n iyield
```

#### 3. Database Rollback (if needed)
```bash
# Restore from snapshot (DESTRUCTIVE)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier iyield-oracle-db-restore \
  --db-snapshot-identifier $PRE_DEPLOY_SNAPSHOT
```

#### 4. Contract Rollback
**Note**: Smart contracts cannot be directly rolled back. Options:
- Pause new contracts via guardian
- Route traffic to previous contract versions
- Emergency governance vote for emergency fixes

### Post-Rollback
- [ ] **Validation**: All systems working with previous version
- [ ] **Monitoring**: Metrics back to baseline
- [ ] **Communication**: Users notified of rollback
- [ ] **Root Cause Analysis**: Incident post-mortem scheduled

---

## 📋 Deployment Record

### Deployment Information
- **Version/Tag**: ________________
- **Deployer**: ____________________
- **Date/Time**: ___________________
- **Environment**: __________________
- **Deployment Type**: New/Update/Hotfix

### Contract Addresses
- **CSV Vault**: ___________________
- **Oracle**: ______________________
- **Token**: _______________________
- **Compliance Registry**: __________

### Validation Results
- **All checks passed**: [ ] Yes [ ] No
- **Performance baseline**: ________
- **Error rate baseline**: __________
- **Rollback tested**: [ ] Yes [ ] No

### Sign-offs
- **Technical Lead**: _______________
- **Security Review**: ______________
- **DevOps Engineer**: ______________
- **Product Owner**: ________________

---

## 🚨 Emergency Deployment

For critical security fixes or urgent bug fixes:

### Fast-Track Checklist
- [ ] **Security Review**: Critical security issue confirmed
- [ ] **Minimal Changes**: Only essential fixes included
- [ ] **Team Notification**: Engineering team alerted
- [ ] **Executive Approval**: CTO/CEO approval obtained
- [ ] **Rollback Ready**: Immediate rollback plan confirmed

### Emergency Process
1. **Skip non-critical validations** (documentation, comprehensive testing)
2. **Expedite security review** (focus on fix validation)
3. **Direct production deployment** (skip staging if urgent)
4. **Enhanced monitoring** (team actively watching)
5. **Immediate rollback** if any issues detected

### Emergency Contacts
- **On-call Engineer**: [Phone/Pager]
- **Security Lead**: [Phone]
- **CTO**: [Phone] 
- **Emergency Multisig**: [Safe address/contacts]

---

**Remember**: When in doubt, rollback and investigate. User funds and system security are always the top priority.