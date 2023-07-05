#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  ERegistryType,
  ESubnet,
  WorkloadConstruct,
} from "../lib/ecs-construct-design-stack";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { DeploymentControllerType } from "aws-cdk-lib/aws-ecs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "MyECSStack");

new WorkloadConstruct(stack, "ConstructWorkload6", {
  vpc: {
    name: "ConstructVPC6",
    subnet: ESubnet.Public,
  },
  logger: {
    retentionDays: RetentionDays.ONE_MONTH,
  },
  registry: {
    image: "nginx",
    type: ERegistryType.Public,
  },
  container: {
    name: "ConstructContainer6",
    port: 80,
  },
  fargateService: {
    serviceName: "ConstructService6",
    desiredCount: 1,
    assignPublicIp: true,
  },
  cluster: {
    name: "ECS-Cluster6",
  },
  exposeApi: true,
  rolloutStrategy: DeploymentControllerType.ECS,
});


app.synth();
