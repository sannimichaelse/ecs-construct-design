import {
  expect as cdkExpect,
  haveResource,
  haveResourceLike,
} from "@aws-cdk/assert";
import * as cdk from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  EClusterType,
  ERegistryType,
  ESubnet,
  WorkloadConstruct,
} from "../lib/ecs-construct-design-stack";

test("WorkloadConstruct creates ECS Cluster correctly", () => {
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
      type: EClusterType.Fargate,
    },
    createDashboard: true,
  });

  cdkExpect(stack).to(
    haveResource("AWS::ECS::Cluster", {
      ClusterName: "ECS-Cluster",
    })
  );
});

test("WorkloadConstruct creates ECS VPC correctly", () => {
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
      type: EClusterType.Fargate,
    },
    createDashboard: true,
  });

  cdkExpect(stack).to(
    haveResource("AWS::EC2::VPC", {
      Tags: [
        {
          Key: "Name",
          Value: "ConstructVPC",
        },
      ],
    })
  );
});

test("WorkloadConstruct creates API Gateway correctly", () => {
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
      type: EClusterType.Fargate,
    },
    exposeApi: true,
  });

  cdkExpect(stack).to(
    haveResource("AWS::ApiGatewayV2::Api", {
      Name: "ecs-api-gateway",
    })
  );
});

test("WorkloadConstruct creates ECS Service correctly", () => {
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
      type: EClusterType.Fargate,
    },
    createDashboard: true,
  });

  cdkExpect(stack).to(
    haveResourceLike("AWS::ECS::Service", {
      DesiredCount: 1,
      LaunchType: "FARGATE",
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          AssignPublicIp: "ENABLED",
          Subnets: [
            { Ref: "ConstructWorkload3MyVpcPublicSubnetSubnet1Subnet4C2AAE50" },
            { Ref: "ConstructWorkload3MyVpcPublicSubnetSubnet2Subnet419B38C8" },
          ],
        },
      },
    })
  );
});
