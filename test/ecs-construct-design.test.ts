import { expect as cdkExpect, haveResource } from "@aws-cdk/assert";
import * as cdk from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  ERegistryType,
  ESubnet,
  WorkloadConstruct,
} from "../lib/ecs-construct-design-stack";

test("WorkloadConstruct creates ECS resources correctly", () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack");
  new WorkloadConstruct(stack, "ConstructWorkload3", {
    vpc: {
      name: "ConstructVPC",
      subnet: ESubnet.Public,
    },
    logger: {
      retentionDays: RetentionDays.ONE_MONTH,
    },
    registry: {
      image: "public-image-repository/my-image:latest",
      type: ERegistryType.Public,
    },
    container: {
      name: "ConstructContainer",
      port: 3002,
    },
    fargateService: {
      serviceName: "ConstructService",
      desiredCount: 1,
      assignPublicIp: true,
    },
    cluster: {
      name: "ECS-Cluster",
    },
    createDashboard: true,
  });

  console.log(stack);
  cdkExpect(stack).to(
    haveResource("AWS::ECS::Service", {
      Properties: {
        LaunchType: "FARGATE",
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            AssignPublicIp: "ENABLED",
            Subnets: [
              { Ref: "TestVpcPublicSubnet1Subnet535B604F" },
              { Ref: "TestVpcPublicSubnet2Subnet3788AAA1" },
            ],
          },
        },
        TaskDefinition: {
          Ref: "TestWorkloadTaskDefinition40B96A2C",
        },
        DeploymentController: {
          Type: "ECS",
        },
      },
    })
  );
});
