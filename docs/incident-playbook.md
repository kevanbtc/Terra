# iYield Protocol Incident Response Playbook

## 🚨 Incident Classification

### Severity Levels

**P0 - Critical (Page Immediately)**
- System completely down or paused
- Security breach or exploit detected  
- Data loss or corruption
- Oracle data stale >2 hours
- Major financial loss risk

**P1 - High (Alert <15 min)**
- Partial system degradation
- Oracle failures (<2 hours stale)
- High error rates (>5%)
- Performance significantly degraded
- Compliance violations detected

**P2 - Medium (Alert <1 hour)**
- Minor performance issues
- Individual service failures with redundancy
- Non-critical feature outages
- Monitoring gaps

**P3 - Low (Next business day)**
- Documentation issues
- Minor UI bugs
- Non-urgent maintenance items

---

## 🔄 Incident Response Process

### 1. Incident Detection
**Automated Detection:**
- Prometheus alerts → PagerDuty → On-call engineer
- AWS CloudWatch alarms
- Kubernetes pod failures
- Application error rates

**Manual Detection:**
- User reports
- Team member observation
- Partner notifications

### 2. Initial Response (First 5 minutes)
1. **Acknowledge the incident** in PagerDuty
2. **Join incident channel** (#iyield-incidents)
3. **Post initial status**: 
   ```
   🚨 INCIDENT: [Brief description]
   Severity: P[0-3]
   Investigating: @username
   Started: [timestamp]
   ```
4. **Start investigation** using relevant runbooks
5. **Page additional responders** if needed

### 3. Investigation & Mitigation
1. **Gather information:**
   - Check dashboards (Grafana)
   - Review logs (kubectl logs)
   - Check recent deployments
   - Verify external dependencies

2. **Implement immediate mitigation:**
   - Stop the bleeding (pause system if needed)
   - Switch to fallback systems
   - Scale resources if needed
   - Roll back recent changes

3. **Keep stakeholders informed** (every 15-30 minutes):
   ```
   UPDATE: [What you found]
   Status: [Investigating/Mitigating/Resolved]
   Next update: [timestamp]
   ETA to resolution: [if known]
   ```

### 4. Resolution & Recovery
1. **Implement permanent fix**
2. **Verify system health** across all components
3. **Monitor for regression** (30+ minutes)
4. **Update status page** and notify users
5. **Document lessons learned**

### 5. Post-Incident Review
**Within 24 hours:**
1. Schedule post-mortem meeting
2. Create incident report document
3. Identify action items for prevention
4. Update runbooks/monitoring as needed

---

## 🎯 Incident-Specific Playbooks

### Oracle Data Stale

**Symptoms:**
- `iyield_oracle_last_update_timestamp` >3600 seconds old
- Frontend showing "Data unavailable"
- Oracle pods in CrashLoopBackOff

**Investigation Steps:**
```bash
# Check oracle pod status
kubectl get pods -n iyield -l app=iyield-oracle

# Check logs for errors
kubectl logs -f deployment/iyield-oracle -n iyield --tail=50

# Check database connectivity
kubectl exec -it deployment/iyield-oracle -n iyield -- \
  pg_isready -h $DB_HOST -p 5432

# Check RPC endpoint
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $RPC_URL
```

**Mitigation:**
```bash
# Restart oracle deployment
kubectl rollout restart deployment/iyield-oracle -n iyield

# Manual emergency attestation (if critical)
kubectl run emergency-attest --rm -it \
  --image=iyield/oracle:latest -n iyield -- \
  node scripts/emergency-attest.js
```

---

### Contract Exploit Detected

**⚠️ CRITICAL SECURITY INCIDENT ⚠️**

**Immediate Actions (DO NOT DELAY):**
1. **PAUSE THE SYSTEM** via Guardian Safe:
   ```bash
   # Emergency pause - requires 2-of-N guardian signatures
   # Use Gnosis Safe UI or CLI to execute pause()
   ```

2. **Isolate the threat:**
   - Document the attack transaction hash
   - Take screenshots of affected state
   - Do NOT revert/fix until fully analyzed

3. **Communication:**
   - Inform security team immediately
   - Prepare user communication (draft only)
   - Contact auditors/security partners
   - **DO NOT** publicly disclose details until patched

4. **Evidence Collection:**
   ```bash
   # Archive current state
   kubectl create backup iyield-incident-$(date +%s) -n iyield
   
   # Export relevant contract events
   node scripts/export-events.js --from-block=$INCIDENT_BLOCK
   
   # Database snapshot
   aws rds create-db-snapshot \
     --db-instance-identifier iyield-oracle-db \
     --db-snapshot-identifier incident-$(date +%s)
   ```

**Analysis Phase:**
- Determine attack vector
- Quantify financial impact
- Develop fix/mitigation
- Plan recovery strategy

**Recovery Phase:**
- Deploy fixes (requires governance approval)
- Gradual system re-enable
- Enhanced monitoring
- User compensation plan (if needed)

---

### High Vault Utilization

**Threshold:** >9000 bps (90%)

**Investigation:**
```bash
# Check current utilization
curl -s "http://grafana.iyield.com/api/datasources/proxy/1/api/v1/query?query=iyield_vault_utilization_bps"

# Check redemption queue
kubectl logs -n iyield deployment/iyield-oracle | grep "Redemption" | tail -20

# Check recent large transactions
node scripts/analyze-large-txs.js --hours=24
```

**Mitigation Options:**
1. **Temporary measures:**
   ```bash
   # Pause new deposits (emergency only)
   # Requires guardian action via Safe
   ```

2. **Process redemptions faster:**
   ```bash
   # Manually trigger redemption processing
   kubectl run manual-redemption --rm -it \
     --image=iyield/oracle:latest -n iyield -- \
     node scripts/process-redemptions.js
   ```

3. **Increase caps (requires governance):**
   - Submit proposal to increase LTV caps
   - Emergency governance process if critical

---

### Database Failure

**Symptoms:**
- Oracle pods failing to connect to DB
- PostgreSQL errors in logs
- RDS instance unavailable

**Immediate Response:**
```bash
# Check RDS instance status
aws rds describe-db-instances --db-instance-identifier iyield-oracle-db

# Check recent snapshots
aws rds describe-db-snapshots --db-instance-identifier iyield-oracle-db \
  --max-items 5 --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]'
```

**Recovery Options:**
1. **Minor issues - Restart instance:**
   ```bash
   aws rds reboot-db-instance --db-instance-identifier iyield-oracle-db
   ```

2. **Major corruption - Restore from snapshot:**
   ```bash
   # Restore to new instance
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier iyield-oracle-db-restore \
     --db-snapshot-identifier $LATEST_SNAPSHOT
   
   # Update connection string
   kubectl patch secret iyield-secrets -n iyield \
     --patch='{"data":{"database-url":"'$(echo -n $NEW_DB_URL | base64)'"}}'
   ```

---

### Kubernetes Cluster Issues

**Pod Failures:**
```bash
# Check pod status
kubectl get pods -n iyield -o wide

# Describe failing pods
kubectl describe pod $POD_NAME -n iyield

# Check node resources
kubectl top nodes
kubectl describe node $NODE_NAME
```

**Cluster-wide Issues:**
```bash
# Check cluster health
kubectl get nodes
kubectl get events --sort-by='.lastTimestamp' | tail -20

# Check EKS cluster status
aws eks describe-cluster --name iyield-cluster
```

**Recovery:**
```bash
# Restart deployments
kubectl rollout restart deployment/iyield-frontend -n iyield
kubectl rollout restart deployment/iyield-oracle -n iyield

# Scale resources if needed
kubectl scale deployment iyield-oracle --replicas=5 -n iyield
```

---

## 📱 Communication Templates

### Initial Incident Notification
```
🚨 INCIDENT ALERT - P[X]

Service: iYield Protocol
Issue: [Brief description]
Impact: [User-facing impact]
Status: Investigating
Investigating: @username
Started: [timestamp]
Next update: [timestamp + 30 mins]

More info: https://status.iyield.com/incidents/[id]
```

### Status Update
```
🔄 INCIDENT UPDATE - P[X]

Investigation findings: [What was discovered]
Mitigation: [What actions were taken]
Current status: [Investigating/Mitigating/Monitoring/Resolved]
User impact: [Current impact level]
ETA: [If known]
Next update: [timestamp]
```

### Resolution Notice
```
✅ INCIDENT RESOLVED - P[X]

Root cause: [Brief explanation]
Resolution: [What fixed it]
Monitoring: [Ongoing monitoring]
Total duration: [start - end time]
Post-mortem: [Meeting scheduled/doc link]

Thank you for your patience during this incident.
```

### User-Facing Communication
```
⚠️ Service Notice

We're currently experiencing [brief description of impact].

What you might see:
- [Specific user impact 1]
- [Specific user impact 2]

We're working to resolve this quickly. Your funds remain secure.

Updates: https://status.iyield.com
ETA: [if available]
```

---

## 🔧 Emergency Procedures

### Guardian Emergency Powers
**When to use:** Critical security threat requiring immediate action

**Process:**
1. **Gather 2-of-N guardian signatures**
2. **Execute emergency pause via Gnosis Safe**
3. **Document reasoning and evidence**
4. **Communicate to team and stakeholders**
5. **Plan recovery/unpause timeline**

### Emergency Oracle Override
**When to use:** Oracle completely failed but system must continue

**Process:**
```bash
# Deploy emergency oracle with manual data
kubectl apply -f manifests/emergency-oracle.yaml

# Manual data submission
node scripts/emergency-oracle-submit.js \
  --nav=$CURRENT_NAV \
  --cid=$BACKUP_CID \
  --timestamp=$(date +%s)
```

### Circuit Breaker Activation
**Automatic triggers:**
- Utilization >95%
- Oracle stale >4 hours  
- Abnormal transaction patterns
- External oracle divergence >10%

**Manual activation:**
```bash
# Requires guardian signatures
# Execute via Gnosis Safe: activateCircuitBreaker()
```

---

## 📞 Escalation Matrix

| Incident Type | Primary Response | Escalation (30 min) | Executive (1 hour) |
|---------------|------------------|---------------------|-------------------|
| Oracle Issues | DevOps Engineer | Platform Lead | CTO |
| Security Breach | Security Lead | DevOps + Platform | CEO + CTO |
| Contract Bug | Smart Contract Dev | Security Lead | CTO + Legal |
| Infrastructure | DevOps Engineer | Infrastructure Lead | CTO |
| Compliance | Compliance Officer | Legal Counsel | CEO + Legal |

**Contact Information:**
- On-call: PagerDuty rotation
- Platform Lead: [Phone/Slack]
- Security Lead: [Phone/Slack] 
- CTO: [Phone] (P0 only)
- CEO: [Phone] (Security/Legal only)

**External Escalation:**
- AWS Support: Enterprise support case
- Security Partners: [Contact info]
- Legal Counsel: [Contact info]
- Insurance: [Policy/Contact info]