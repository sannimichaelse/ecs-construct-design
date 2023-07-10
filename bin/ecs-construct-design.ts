#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  ERegistryType,
  ESubnet,
  WorkloadConstruct,
  EClusterType,
} from "../lib/ecs-construct-design-stack";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { DeploymentControllerType } from "aws-cdk-lib/aws-ecs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "MyStack", {
  env: {
    region: "us-east-1",
  },
});

new WorkloadConstruct(stack, "workloadConstruct", {
  vpc: {
    name: "constructVpc",
    subnet: ESubnet.Public,
  },
  logger: {
    retentionDays: RetentionDays.ONE_MONTH,
  },
  registry: {
    image: "tomiwatech/parser:amd64",
    type: ERegistryType.Public,
  },
  container: {
    name: "constructContainer",
    port: 6000,
  },
  fargateService: {
    serviceName: "constructFargateService",
    desiredCount: 1,
    assignPublicIp: true,
  },
  cluster: {
    name: "workloadCluster",
    type: EClusterType.Fargate,
  },
  exposeApi: true,
  rolloutStrategy: DeploymentControllerType.ECS,
});

app.synth();
