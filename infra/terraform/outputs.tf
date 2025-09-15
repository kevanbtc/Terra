output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = aws_eks_cluster.main.certificate_authority[0].data
}

output "rds_endpoint" {
  description = "Oracle database endpoint"
  value       = aws_db_instance.oracle_db.endpoint
}

output "rds_port" {
  description = "Oracle database port"
  value       = aws_db_instance.oracle_db.port
}

output "s3_deployment_receipts_bucket" {
  description = "S3 bucket for deployment receipts"
  value       = aws_s3_bucket.deployment_receipts.bucket
}

output "s3_deployment_receipts_arn" {
  description = "S3 bucket ARN for deployment receipts"
  value       = aws_s3_bucket.deployment_receipts.arn
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = aws_lb.frontend.dns_name
}

output "alb_zone_id" {
  description = "Application Load Balancer zone ID"
  value       = aws_lb.frontend.zone_id
}

output "route53_zone_id" {
  description = "Route53 hosted zone ID"
  value       = aws_route53_zone.main.zone_id
}

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "kms_key_id" {
  description = "KMS key ID for Safe operations"
  value       = aws_kms_key.safe_ops.key_id
}

output "kms_key_arn" {
  description = "KMS key ARN for Safe operations"
  value       = aws_kms_key.safe_ops.arn
}

# Generate deployment config for frontend
output "deployment_config" {
  description = "Deployment configuration for frontend and services"
  value = jsonencode({
    timestamp = timestamp()
    network   = var.ethereum_network
    aws = {
      region = var.aws_primary_region
      eks_cluster = aws_eks_cluster.main.name
      rds_endpoint = aws_db_instance.oracle_db.endpoint
      s3_bucket = aws_s3_bucket.deployment_receipts.bucket
      alb_dns = aws_lb.frontend.dns_name
    }
    ethereum = {
      network = var.ethereum_network
      rpc_primary = var.rpc_primary_url
      rpc_fallback = var.rpc_fallback_url
      safe_gov = var.safe_gov_address
      safe_guardian = var.safe_guardian_address
    }
    k8s = {
      namespace = "iyield"
      frontend_service = "iyield-frontend-service"
      oracle_service = "iyield-oracle-service"
      monitoring_namespace = "monitoring"
    }
  })
}