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
} from "aws-cdk-lib/aws-ecs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  Vpc,
  Port,
  SubnetType,
  SecurityGroup,
  Peer,
} from "aws-cdk-lib/aws-ec2";
import { Dashboard, GraphWidget } from "aws-cdk-lib/aws-cloudwatch";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { NamespaceType } from "aws-cdk-lib/aws-servicediscovery";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import * as integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as apigwv2 from "@aws-cdk/aws-apigatewayv2-alpha";

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
      const taskDefinition = this.createTaskDefinition("ECSDesignTask");
      this.createContainer(props, taskDefinition);
      const service = this.createService(props, cluster, taskDefinition);
      this.createCloudWatchDashboard(service);
    }
  }

  private createCluster(props: WorkloadProps): ICluster {
    const vpc = this.createVPC(props);
    return new Cluster(this, "Cluster", {
      vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
      clusterName: props.cluster.name,
      defaultCloudMapNamespace: {
        name: "default",
        type: NamespaceType.DNS_PRIVATE,
      },
    });
  }

  private createVPC(props: WorkloadProps): Vpc {
    const { subnet, name } = props.vpc;
    const subnetType =
      subnet === ESubnet.Private
        ? SubnetType.PRIVATE_WITH_EGRESS
        : SubnetType.PUBLIC;

    return new Vpc(this, "MyVpc", {
      vpcName: name,
      subnetConfiguration: [
        {
          subnetType: subnetType,
          name: "Subnet",
        },
      ],
    });
  }

  private createTaskDefinition(name: string): FargateTaskDefinition {
    return new FargateTaskDefinition(this, name, {
      memoryLimitMiB: 512,
      cpu: 256,
    });
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

  private getSecret(
    secretName: string,
    secretArn: string
  ): secretsmanager.ISecret {
    return secretsmanager.Secret.fromSecretAttributes(this, secretName, {
      secretCompleteArn: secretArn,
    });
  }

  private getImageFromRegistry(props: WorkloadProps): ContainerImage {
    if (
      props.registry.type === ERegistryType.Private &&
      props.registry.secret
    ) {
      const registrySecret = this.getSecret(
        props.registry.secretName!,
        props.registry.secretArn!
      );
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
    securityGroup: SecurityGroup
  ): ApplicationLoadBalancedFargateService {
    const { desiredCount, assignPublicIp } = props.fargateService;
    const service = new ApplicationLoadBalancedFargateService(this, "Service", {
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
      },
    });

    if (securityGroup) {
      service.service.connections.securityGroups.push(securityGroup);
    }

    return service;
  }

  private createService(
    props: WorkloadProps,
    cluster: ICluster,
    taskDefinition: FargateTaskDefinition
  ): FargateService {
    const { desiredCount, assignPublicIp } = props.fargateService;
    return new FargateService(this, "Service", {
      cluster,
      taskDefinition,
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
    service: ApplicationLoadBalancedFargateService
  ): void {
    const httpApi = new apigwv2.HttpApi(this, "ecs-api-gateway", {
      apiName: "ecs-api-gateway",
    });

    const albIntegration = new integrations.HttpAlbIntegration(
      "ecs-alb-integration",
      service.listener,
      {
        method: apigwv2.HttpMethod.ANY,
      }
    );

    new apigwv2.HttpRoute(this, "ApiGatewayRoute", {
      httpApi,
      routeKey: apigwv2.HttpRouteKey.with("/{proxy+}", apigwv2.HttpMethod.ANY),
      integration: albIntegration,
    });
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
