# iYield Protocol Operations Playbook

## 🚨 Incident Response

### Oracle Data Stale/Failed

**Symptoms:**
- Oracle hasn't updated in >1 hour
- Frontend showing stale data
- Prometheus alerts firing

**Immediate Response:**
1. Check oracle pod status:
   ```bash
   kubectl get pods -n iyield -l app=iyield-oracle
   kubectl describe pod <oracle-pod-name> -n iyield
   ```

2. Check oracle logs:
   ```bash
   kubectl logs -f deployment/iyield-oracle -n iyield --tail=100
   ```

3. Restart oracle deployment:
   ```bash
   kubectl rollout restart deployment/iyield-oracle -n iyield
   kubectl rollout status deployment/iyield-oracle -n iyield
   ```

4. Manual attestation (emergency):
   ```bash
   kubectl run manual-attest --rm -it --image=iyield/oracle:latest -n iyield -- \
     node scripts/emergency-attest.js
   ```

**Root Cause Analysis:**
- Check RPC endpoint health
- Verify database connectivity
- Review oracle private key rotation
- Check attestor threshold configuration

---

### System Paused (Guardian Action)

**Symptoms:**
- All contract interactions failing
- "System is paused" errors in frontend
- Guardian pause event emitted

**Response:**
1. Verify pause reason:
   ```bash
   # Check recent guardian actions
   kubectl logs -n iyield deployment/iyield-oracle | grep "Guardian"
   ```

2. Check Gnosis Safe transactions:
   ```bash
   # Use Gnosis Safe UI or API to review recent transactions
   curl "https://safe-transaction-mainnet.safe.global/api/v1/safes/$GUARDIAN_SAFE_ADDRESS/transactions/"
   ```

3. **ONLY UNPAUSE IF INCIDENT IS RESOLVED:**
   ```bash
   # Connect to Guardian Safe
   # Execute unpause() transaction
   # Requires 2-of-N guardian signatures
   ```

**Critical:** Never unpause without understanding root cause.

---

### High Vault Utilization (>90%)

**Symptoms:**
- Utilization >9000 bps
- New deposits failing
- LTV approaching caps

**Response:**
1. Check current vault status:
   ```bash
   # Query vault metrics from Grafana or direct contract call
   curl "http://grafana.iyield.com/api/datasources/proxy/1/api/v1/query?query=iyield_vault_utilization_bps"
   ```

2. Review redemption queue:
   ```bash
   kubectl logs -n iyield deployment/iyield-oracle | grep "Redemption"
   ```

3. Consider emergency measures:
   - Contact large token holders for voluntary redemptions
   - Pause new deposits temporarily
   - Increase LTV caps (requires governance vote)

---

### RPC Endpoint Failure

**Symptoms:**
- High RPC latency alerts
- Oracle update failures
- Frontend connection errors

**Response:**
1. Switch to fallback RPC:
   ```bash
   kubectl patch configmap iyield-config -n iyield -p '{"data":{"rpc-primary-url":"$FALLBACK_RPC_URL"}}'
   kubectl rollout restart deployment/iyield-oracle -n iyield
   kubectl rollout restart deployment/iyield-frontend -n iyield
   ```

2. Update secrets if needed:
   ```bash
   # Update RPC URL in AWS Secrets Manager
   aws secretsmanager update-secret --secret-id iyield/production/rpc-url --secret-string "$NEW_RPC_URL"
   # Restart external-secrets to pick up change
   kubectl delete pod -n iyield -l app.kubernetes.io/name=external-secrets
   ```

---

## 🔄 Operational Procedures

### Oracle Key Rotation

**Frequency:** Every 90 days or on suspected compromise

**Procedure:**
1. Generate new oracle private key:
   ```bash
   # Use secure key generation
   openssl rand -hex 32
   ```

2. Update key in AWS Secrets Manager:
   ```bash
   aws secretsmanager update-secret \
     --secret-id iyield/production/oracle-private-key \
     --secret-string "$NEW_PRIVATE_KEY"
   ```

3. Deploy oracle with new key:
   ```bash
   kubectl rollout restart deployment/iyield-oracle -n iyield
   kubectl rollout status deployment/iyield-oracle -n iyield
   ```

4. Update oracle address in contracts (if needed):
   - Submit governance proposal
   - Execute through Gnosis Safe

---

### Database Maintenance

**Frequency:** Weekly backups, monthly maintenance

**Backup Procedure:**
```bash
# Create RDS snapshot
aws rds create-db-snapshot \
  --db-instance-identifier iyield-oracle-db \
  --db-snapshot-identifier iyield-backup-$(date +%Y%m%d)

# Verify backup
aws rds describe-db-snapshots \
  --db-snapshot-identifier iyield-backup-$(date +%Y%m%d)
```

**Maintenance Window:**
- Schedule during low-activity periods (2-4 AM UTC)
- Announce maintenance 24 hours in advance
- Monitor oracle data freshness post-maintenance

---

### Contract Deployment

**Prerequisites:**
- Code review and approval
- Slither security analysis passed
- Test suite coverage >95%
- Governance approval for upgrades

**Deployment Steps:**
1. Deploy to staging:
   ```bash
   cd contracts
   npx hardhat deploy --network sepolia
   ```

2. Verify contracts:
   ```bash
   npx hardhat verify --network sepolia $CONTRACT_ADDRESS
   ```

3. Update frontend ABIs:
   ```bash
   cp artifacts/contracts/core/*.sol/*.json frontend/abis/
   ```

4. Deploy to production (requires multisig):
   ```bash
   npx hardhat deploy --network mainnet
   # Submit transactions to Gnosis Safe
   ```

---

### Monitoring & Alerting

**Key Metrics to Monitor:**
- Oracle data freshness (<1 hour)
- Vault utilization (<90%)
- RPC endpoint latency (<2s)
- Pod restart counts
- Compliance violation rates

**Alert Escalation:**
1. **P0 (Critical)** - Page on-call engineer immediately
   - System paused
   - Oracle data stale >2 hours
   - Security breach detected

2. **P1 (High)** - Alert within 15 minutes
   - High utilization (>85%)
   - RPC endpoint failures
   - Deployment failures

3. **P2 (Medium)** - Alert within 1 hour
   - Compliance violations
   - Performance degradation
   - Non-critical failures

---

### Disaster Recovery

**RTO (Recovery Time Objective):** 4 hours
**RPO (Recovery Point Objective):** 15 minutes

**Recovery Procedures:**

1. **Complete AWS Region Failure:**
   ```bash
   # Switch to secondary region
   terraform apply -var="primary_region=us-west-2"
   
   # Restore database from backup
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier iyield-oracle-db-restore \
     --db-snapshot-identifier $LATEST_SNAPSHOT
   
   # Update DNS records
   aws route53 change-resource-record-sets --hosted-zone-id $ZONE_ID \
     --change-batch file://dns-failover.json
   ```

2. **Database Corruption:**
   ```bash
   # Restore from snapshot
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier iyield-oracle-db-restore \
     --db-snapshot-identifier $SNAPSHOT_ID
   
   # Update connection strings
   kubectl patch secret iyield-secrets -n iyield \
     --patch='{"data":{"database-url":"'$(echo -n $NEW_DB_URL | base64)'"}}'
   ```

3. **Kubernetes Cluster Failure:**
   ```bash
   # Create new EKS cluster
   terraform apply -target=aws_eks_cluster.main
   
   # Restore from GitOps
   kubectl apply -f infra/k8s/
   
   # Restore secrets from AWS Secrets Manager
   kubectl apply -f infra/k8s/secrets.yaml
   ```

---

## 📞 Contacts & Escalation

**On-Call Rotation:**
- Primary: [Phone/Slack]
- Secondary: [Phone/Slack] 
- Escalation: [Management contact]

**External Dependencies:**
- AWS Support: [Case management URL]
- Alchemy Support: [Email/Slack]
- Gnosis Safe Support: [Discord/Email]

**Communication Channels:**
- Incident Channel: #iyield-incidents
- Status Page: status.iyield.com
- User Notifications: Twitter @iYieldProtocol

---

## 🔧 Runbooks Quick Reference

| Incident Type | First Response | Time to Resolution |
|---------------|----------------|-------------------|
| Oracle Stale | Restart pods | 5 minutes |
| RPC Failure | Switch endpoint | 2 minutes |
| High Utilization | Monitor/pause | 15 minutes |
| System Paused | Investigate cause | 30 minutes |
| DB Failure | Restore snapshot | 2 hours |
| Region Failure | Failover region | 4 hours |

**Emergency Contacts:**
- Burnzy (Lead): +1-XXX-XXX-XXXX
- DevOps Lead: +1-XXX-XXX-XXXX
- Security Lead: +1-XXX-XXX-XXXX