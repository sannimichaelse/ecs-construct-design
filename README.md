# ECS-construct-design

Deploy an ECS workload on AWS. The construct provides flexibility in configuring various aspects of the workload, including the VPC, container, registry, Fargate service, logging, and more.

# Usage
To use the WorkloadConstruct, you can create an instance of it in your AWS CDK stack with different configurations. Here are three examples demonstrating different ways to call the WorkloadConstruct:

### Example 1
```
import { WorkloadConstruct, ESubnet, ERegistryType } from "./workload-construct";

new WorkloadConstruct(stack, "ConstructWorkload1", {
  vpc: {
    name: "ConstructVPC1",
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
    name: "ConstructContainer1",
    port: 80,
  },
  fargateService: {
    serviceName: "ConstructService1",
    desiredCount: 1,
    assignPublicIp: true,
  },
  cluster: {
    name: "ECS-Cluster1",
  },
  rolloutStrategy: DeploymentControllerType.ECS,
});

```

### Example 2
```
import { WorkloadConstruct, ESubnet, ERegistryType } from "./workload-construct";

new WorkloadConstruct(stack, "ConstructWorkload2", {
  vpc: {
    name: "ConstructVPC2",
    subnet: ESubnet.Private,
  },
  logger: {
    enabled: true,
    retentionDays: RetentionDays.INFINITE,
  },
  registry: {
    image: "my-registry-image",
    type: ERegistryType.Private,
    secretName: "my-registry-secret",
    secretArn: "arn:aws:secretsmanager:us-west-2:123456789012:secret:my-secret",
  },
  container: {
    name: "ConstructContainer2",
    port: 8080,
  },
  fargateService: {
    serviceName: "ConstructService2",
    desiredCount: 2,
    assignPublicIp: false,
  },
  cluster: {
    name: "ECS-Cluster2",
  },
});
```

### Example 3
```
import { WorkloadConstruct, ESubnet, ERegistryType } from "./workload-construct";

new WorkloadConstruct(stack, "ConstructWorkload3", {
  vpc: {
    name: "ConstructVPC3",
    subnet: ESubnet.Public,
  },
  logger: {
    enabled: false,
  },
  registry: {
    image: "my-private-registry-image",
    type: ERegistryType.Private,
    secretName: "my-private-registry-secret",
    secretArn: "arn:aws:secretsmanager:us-west-2:123456789012:secret:my-private-secret",
  },
  container: {
    name: "ConstructContainer3",
    port: 3000,
  },
  fargateService: {
    serviceName: "ConstructService3",
    desiredCount: 3,
    assignPublicIp: true,
  },
  cluster: {
    name: "ECS-Cluster3",
  },
  createDashboard: true,
});

```

# Running the CDK

To deploy the AWS CDK stack and run the WorkloadConstruct, follow these steps:

Make sure you have the AWS CDK installed. If not, install it using the following command:
```
npm install -g aws-cdk
```

Install project dependencies by running the following command:
```
npm install
```
Deploy the CDK stack by running:
```
cdk deploy
```
Bootstrap the CDK stack:
```
cdk bootstrap
```

Running test
```
npm test
```
The AWS CDK will deploy the stack based on the configurations provided in the examples.


# Configuration Options
The WorkloadConstruct accepts the following configuration options:

- **vpc**: Specifies the VPC configuration for the workload.
- **logger**: Specifies the logging configuration for the workload.
- **registry**: Specifies the registry configuration for the container image.
- **container**: Specifies the container configuration for the workload.
- **fargateService**: Specifies the Fargate service configuration.
- **cluster**: Specifies the cluster configuration for the workload.
- **rolloutStrategy**: Specifies the rollout strategy for the Fargate service.
- **createDashboard**: Determines whether to create a CloudWatch dashboard for monitoring.

Note: Some options are optional and have default values.

# Output

Link to deployed container on ECS(Fargate) via cdk can be found [here](http://myecs-const-8t19qd47yx59-1675241258.us-east-1.elb.amazonaws.com/)