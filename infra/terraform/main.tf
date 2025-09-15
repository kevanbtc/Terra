terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
  }
}

# Multi-region setup for resilience
provider "aws" {
  region = var.aws_primary_region
}

provider "aws" {
  alias  = "secondary"
  region = var.aws_secondary_region
}

# S3 bucket for deployment receipts + IPFS pinning
resource "aws_s3_bucket" "deployment_receipts" {
  bucket = "${var.project_name}-deployment-receipts"
}

resource "aws_s3_bucket_versioning" "deployment_receipts" {
  bucket = aws_s3_bucket.deployment_receipts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "deployment_receipts" {
  bucket = aws_s3_bucket.deployment_receipts.id
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

# RDS for oracle data persistence
resource "aws_db_instance" "oracle_db" {
  identifier     = "${var.project_name}-oracle-db"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.micro"
  allocated_storage = 20
  
  db_name  = "oracle_data"
  username = "oracle_admin"
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.oracle_db.id]
  db_subnet_group_name   = aws_db_subnet_group.oracle.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = true
}

# EKS cluster for running services
resource "aws_eks_cluster" "main" {
  name     = "${var.project_name}-cluster"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = "1.28"

  vpc_config {
    subnet_ids = concat(aws_subnet.private[*].id, aws_subnet.public[*].id)
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_service_policy,
  ]
}

# EKS node group
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "main-nodes"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = aws_subnet.private[*].id

  scaling_config {
    desired_size = 2
    max_size     = 4
    min_size     = 1
  }

  instance_types = ["t3.medium"]

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.ec2_container_registry_read_only,
  ]
}

# ALB for frontend
resource "aws_lb" "frontend" {
  name               = "${var.project_name}-frontend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = aws_subnet.public[*].id

  enable_deletion_protection = false
}

# Route53 for DNS
resource "aws_route53_zone" "main" {
  name = var.domain_name
}

resource "aws_route53_record" "frontend" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.frontend.dns_name
    zone_id                = aws_lb.frontend.zone_id
    evaluate_target_health = true
  }
}

# Output deployment addresses for contracts
resource "local_file" "deployment_receipts" {
  content = jsonencode({
    timestamp = timestamp()
    network   = var.ethereum_network
    addresses = {
      safe_gov        = var.safe_gov_address
      safe_guardian   = var.safe_guardian_address
      rpc_primary     = var.rpc_primary_url
      rpc_fallback    = var.rpc_fallback_url
    }
    infra = {
      eks_cluster     = aws_eks_cluster.main.endpoint
      alb_dns         = aws_lb.frontend.dns_name
      s3_bucket       = aws_s3_bucket.deployment_receipts.bucket
      db_endpoint     = aws_db_instance.oracle_db.endpoint
    }
  })
  filename = "${path.module}/../../frontend/deployment_receipts.json"
}