variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "iyield"
}

variable "aws_primary_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_secondary_region" {
  description = "Secondary AWS region for failover"
  type        = string
  default     = "us-west-2"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
}

variable "ethereum_network" {
  description = "Ethereum network (mainnet, sepolia, etc)"
  type        = string
  default     = "mainnet"
}

variable "safe_gov_address" {
  description = "Gnosis Safe address for governance"
  type        = string
}

variable "safe_guardian_address" {
  description = "Gnosis Safe address for guardian role"
  type        = string
}

variable "rpc_primary_url" {
  description = "Primary RPC URL (Alchemy/Infura)"
  type        = string
}

variable "rpc_fallback_url" {
  description = "Fallback RPC URL"
  type        = string
}

variable "db_password" {
  description = "Database password for oracle data"
  type        = string
  sensitive   = true
}

variable "availability_zones" {
  description = "Availability zones for multi-AZ deployment"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}