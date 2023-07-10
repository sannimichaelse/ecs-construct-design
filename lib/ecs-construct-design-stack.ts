import { Construct } from "constructs";
import {
  Cluster,
  FargateService,
  FargateTaskDefinition,
  ContainerImage,
  ICluster,
  AwsLogDriver,
  DeploymentControllerType,
  ContainerDefinition,
  ClusterProps,
  Ec2Service,
  Ec2TaskDefinition,
  NetworkMode,
} from "aws-cdk-lib/aws-ecs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  Vpc,
  Port,
  SubnetType,
  SecurityGroup,
  Peer,
  InstanceType,
} from "aws-cdk-lib/aws-ec2";
import { Dashboard, GraphWidget } from "aws-cdk-lib/aws-cloudwatch";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { NamespaceType } from "aws-cdk-lib/aws-servicediscovery";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import * as integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";

export enum EClusterType {
  Fargate = "fargate",
  EC2 = "ec2",
}

export enum ESubnet {
  Public = "public",
  Private = "private",
}

export enum ERegistryType {
  Public = "public",
  Private = "private",
}

interface IContainerCredentials {
  name: string;
  port: number;
}

interface IClusterCredentials {
  name: string;
  type: EClusterType;
}

interface ITaskDefinition {
  memoryLimitMiB?: number;
  cpu?: number;
  type: EClusterType;
}

interface IFargateServiceCredentials {
  serviceName: string;
  desiredCount: number;
  assignPublicIp: boolean;
}

interface IRegistryCredentials {
  image: string;
  type: ERegistryType;
  secretName?: string;
  secret?: secretsmanager.ISecret;
  secretArn?: string;
}

interface ILogger {
  enabled?: boolean;
  retentionDays?: RetentionDays;
}

interface IVPC {
  name?: string;
  subnet?: ESubnet;
}

interface WorkloadProps {
  cluster: IClusterCredentials;
  container: IContainerCredentials;
  registry: IRegistryCredentials;
  fargateService: IFargateServiceCredentials;
  vpc: IVPC;
  exposeApi?: boolean;
  logger?: ILogger;
  rolloutStrategy?: DeploymentControllerType;
  createDashboard?: boolean;
  environment?: { [key: string]: string };
}

export class WorkloadConstruct extends Construct {
  constructor(scope: Construct, id: string, props: WorkloadProps) {
    super(scope, id);

    const cluster = this.createCluster(props);
    const securityGroup = this.createSecurityGroup(cluster, props);
    if (props.exposeApi) {
      const service = this.createLoadBalancedService(
        props,
        cluster,
        securityGroup
      );
      this.createApiGateway(service);
      this.createCloudWatchDashboard(service);
    } else {
      const taskDefinition = this.createTaskDefinition("ECSDesignTask", {
        type: EClusterType.Fargate,
      });
      this.createContainer(props, taskDefinition);
      const service = this.createService(props, cluster, taskDefinition);
      this.createCloudWatchDashboard(service);
    }
  }

  private createCluster(props: WorkloadProps): ICluster {
    const vpc = this.createVPC(props);
    const clusterProps: ClusterProps = {
      vpc,
      enableFargateCapacityProviders:
        props.cluster.type === EClusterType.Fargate,
      containerInsights: true,
      clusterName: props.cluster.name,
      defaultCloudMapNamespace: {
        name: "default",
        type: NamespaceType.DNS_PRIVATE,
      },
    };

    const cluster = new Cluster(this, "Cluster", clusterProps);
    if (props.cluster.type === EClusterType.EC2) {
      cluster.addCapacity("EC2Capacity", {
        instanceType: new InstanceType("t3.medium"),
        desiredCapacity: 1,
        maxCapacity: 10,
      });
    }
    return cluster;
  }

  private createVPC(props: WorkloadProps): Vpc {
    const { name } = props.vpc;

    return new Vpc(this, "MyVpc", {
      vpcName: name,
      subnetConfiguration: [
        {
          cidrMask: 24,
          subnetType: SubnetType.PUBLIC,
          name: "Public Subnet",
        },
        {
          cidrMask: 24,
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          name: "Private Subnet",
        },
      ],
    });
  }

  private createTaskDefinition(
    name: string,
    props: ITaskDefinition
  ): FargateTaskDefinition | Ec2TaskDefinition {
    if (props.type === EClusterType.Fargate) {
      return new FargateTaskDefinition(this, name, {
        memoryLimitMiB: props.memoryLimitMiB,
        cpu: props.cpu,
      });
    } else if (props.type === EClusterType.EC2) {
      return new Ec2TaskDefinition(this, name, {
        networkMode: NetworkMode.AWS_VPC,
      });
    }

    throw new Error("Invalid task definition type.");
  }

  private createContainer(
    props: WorkloadProps,
    taskDefinition: FargateTaskDefinition
  ): ContainerDefinition {
    const logGroup = new LogGroup(this, "LogGroup", {
      retention: props.logger?.retentionDays,
    });
    const container = taskDefinition.addContainer("Container", {
      image: this.getImageFromRegistry(props),
      containerName: props.container.name,
      memoryLimitMiB: 512,
      cpu: 256,
      logging: props.logger?.enabled
        ? new AwsLogDriver({
            logGroup,
            streamPrefix: "my-container",
          })
        : undefined,
    });

    container.addPortMappings({ containerPort: 80 });

    return container;
  }

  private getSecret(secretName: string): secretsmanager.ISecret {
    return secretsmanager.Secret.fromSecretNameV2(this, "Secret", secretName);
  }

  private getImageFromRegistry(props: WorkloadProps): ContainerImage {
    if (
      props.registry.type === ERegistryType.Private &&
      props.registry.secret
    ) {
      const registrySecret = this.getSecret(props.registry.secretName!);
      return ContainerImage.fromRegistry(props.registry.image, {
        credentials: registrySecret,
      });
    }

    return ContainerImage.fromRegistry(props.registry.image);
  }

  private createSecurityGroup(cluster: ICluster, props: WorkloadProps) {
    const securityGroup = new SecurityGroup(this, "ServiceSecurityGroup", {
      vpc: cluster.vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      Peer.ipv4("0.0.0.0/0"),
      Port.tcp(props.container.port)
    );
    return securityGroup;
  }

  private createLoadBalancedService(
    props: WorkloadProps,
    cluster: ICluster,
    securityGroup: SecurityGroup,
    taskDefinition?: FargateTaskDefinition | Ec2TaskDefinition
  ): ApplicationLoadBalancedFargateService | Ec2Service {
    const { desiredCount, assignPublicIp } = props.fargateService;
    let service: ApplicationLoadBalancedFargateService | Ec2Service;
    const secret = this.getSecret("appName");
    if (props.cluster.type === EClusterType.EC2) {
      service = new Ec2Service(this, "Service", {
        cluster,
        taskDefinition: taskDefinition as Ec2TaskDefinition,
        desiredCount,
        assignPublicIp,
        deploymentController: props.rolloutStrategy
          ? { type: props.rolloutStrategy }
          : undefined,
      });
    } else {
      service = new ApplicationLoadBalancedFargateService(this, "Service", {
        cluster,
        desiredCount,
        assignPublicIp,
        deploymentController: props.rolloutStrategy
          ? {
              type: props.rolloutStrategy,
            }
          : undefined,
        memoryLimitMiB: 512,
        cpu: 256,
        publicLoadBalancer: true,
        taskImageOptions: {
          image: this.getImageFromRegistry(props),
          containerName: props.container.name,
          containerPort: props.container.port,
          enableLogging: true,
          logDriver: new AwsLogDriver({
            streamPrefix: `ECSLog`,
          }),
          environment: {
            APPLICATION_NAME: secret.secretValueFromJson("name").unsafeUnwrap(),
          },
        },
      });

      if (securityGroup) {
        service.service.connections.securityGroups.push(securityGroup);
      }
    }

    return service;
  }

  private createService(
    props: WorkloadProps,
    cluster: ICluster,
    taskDefinition?: FargateTaskDefinition | Ec2TaskDefinition
  ): FargateService | Ec2Service {
    const { desiredCount, assignPublicIp } = props.fargateService;
    if (props.cluster.type === EClusterType.EC2) {
      return new Ec2Service(this, "Service", {
        cluster,
        taskDefinition: taskDefinition as Ec2TaskDefinition,
        desiredCount,
        assignPublicIp,
        deploymentController: props.rolloutStrategy
          ? { type: props.rolloutStrategy }
          : undefined,
      });
    }
    return new FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDefinition as FargateTaskDefinition,
      desiredCount,
      assignPublicIp,
      deploymentController: props.rolloutStrategy
        ? {
            type: props.rolloutStrategy,
          }
        : undefined,
    });
  }

  private createApiGateway(
    service: ApplicationLoadBalancedFargateService | Ec2Service
  ): void {
    const httpApi = new apigwv2.HttpApi(this, "ecs-api-gateway", {
      apiName: "ecs-api-gateway",
    });

    if (service instanceof ApplicationLoadBalancedFargateService) {
      const integrationUrl = `http://${service.loadBalancer.loadBalancerDnsName}`;

      httpApi.addRoutes({
        path: "/",
        methods: [apigwv2.HttpMethod.ANY],
        integration: new integrations.HttpUrlIntegration(
          "ecs-alb-integration",
          integrationUrl,
          {
            method: apigwv2.HttpMethod.ANY,
          }
        ),
      });
    } else {
      console.warn("API Gateway integration is not supported for Ec2Service");
      // Handle Ec2Service scenario
    }
  }

  private createCloudWatchDashboard(
    alb: ApplicationLoadBalancedFargateService | FargateService
  ): void {
    const dashboard = new Dashboard(this, "ServiceDashboard");
    if (alb instanceof ApplicationLoadBalancedFargateService) {
      dashboard.addWidgets(
        new GraphWidget({
          title: "CPU Utilization",
          left: [alb.service.metricCpuUtilization()],
        }),
        new GraphWidget({
          title: "Memory Utilization",
          left: [alb.service.metricMemoryUtilization()],
        })
      );
    } else {
      dashboard.addWidgets(
        new GraphWidget({
          title: "CPU Utilization",
          left: [alb.metricCpuUtilization()],
        }),
        new GraphWidget({
          title: "Memory Utilization",
          left: [alb.metricMemoryUtilization()],
        })
      );
    }
  }
}
