import * as fs from 'fs';
import * as oci from '@pulumi/oci';
import * as command from '@pulumi/command';
import { env } from './env';
import { readScript } from './utils';

const angelCompartment = new oci.identity.Compartment('angel-cloud', {
  name: 'angel-cloud',
  description: "Angel's Cloud",
  enableDelete: true,
});

const compartmentId = angelCompartment.id;

// Virtual Cloud Network (VCN)
const vcn = new oci.core.Vcn('angel-vcn', {
  cidrBlock: '10.0.0.0/16',
  compartmentId,
  displayName: 'Angel VCN',
});

// Internet Gateway
const igw = new oci.core.InternetGateway('angel-igw', {
  compartmentId,
  vcnId: vcn.id,
  displayName: 'Angel IGW',
  enabled: true,
});

// Route Table
const routeTable = new oci.core.RouteTable('angel-rt', {
  compartmentId,
  vcnId: vcn.id,
  displayName: 'Angel RT',
  routeRules: [
    {
      destination: '0.0.0.0/0',
      destinationType: 'CIDR_BLOCK',
      networkEntityId: igw.id,
    },
  ],
});

// Security List
const securityList = new oci.core.SecurityList('angel-security-list', {
  compartmentId,
  vcnId: vcn.id,
  displayName: 'Angel Security List',
  ingressSecurityRules: [
    {
      description: 'SSH',
      protocol: '6', // TCP
      source: '0.0.0.0/0',
      sourceType: 'CIDR_BLOCK',
      tcpOptions: {
        min: 22,
        max: 22,
      },
    },
    {
      description: 'Expose n8n UI',
      protocol: '6', // TCP
      source: '0.0.0.0/0',
      sourceType: 'CIDR_BLOCK',
      tcpOptions: {
        min: parseInt(env.N8N_PORT),
        max: parseInt(env.N8N_PORT),
      },
    },
  ],
  egressSecurityRules: [
    {
      protocol: 'all',
      destination: '0.0.0.0/0',
      destinationType: 'CIDR_BLOCK',
    },
  ],
});

// Subnet
const subnet = new oci.core.Subnet('angel-subnet', {
  cidrBlock: '10.0.1.0/24',
  compartmentId,
  vcnId: vcn.id,
  displayName: 'Angel Subnet',
  prohibitPublicIpOnVnic: false,
  routeTableId: routeTable.id,
  securityListIds: [securityList.id],
});

// Oracle-Linux-9.6-2025.07.21-0
const imageOcid = 'ocid1.image.oc1.us-chicago-1.aaaaaaaa276g7fp3we3wuf2pdumz7c5eiho6iwbg6daiijgqp7u2jt77nkja';

// list all availability domains
const availabilityDomain = compartmentId
  .apply(id =>
    oci.identity.getAvailabilityDomains({
      compartmentId: id,
      filters: [
        {
          name: 'name',
          values: ['US-CHICAGO-1-AD-1'],
          regex: true,
        },
      ],
    })
  )
  .apply(ad => ad.availabilityDomains[0]);

const cloudInitScript = readScript('./init/cloud-init.sh');

// Script contents for Pulumi commands
const volumeMountScript = readScript('./init/volume-mount.sh');
const duckdnsScript = readScript('./init/duckdns.sh');
const dockerComposeContent = readScript('./init/docker-compose.yml');
const n8nDeploymentScript = readScript('./init/n8n.sh').replace('__DOCKER_COMPOSE_CONTENT__', dockerComposeContent);

// Volume
const volume = new oci.core.Volume('angel-volume', {
  compartmentId,
  availabilityDomain: availabilityDomain.name,
  sizeInGbs: '100',
  displayName: 'Angel Volume',
});

// Compute Instance
const instance = new oci.core.Instance(
  'angel-instance',
  {
    compartmentId,
    availabilityDomain: availabilityDomain.name,
    shape: 'VM.Standard.E5.Flex',
    shapeConfig: {
      ocpus: 1,
      memoryInGbs: 8,
    },
    displayName: 'Angel Instance',
    createVnicDetails: {
      subnetId: subnet.id,
    },
    sourceDetails: {
      sourceType: 'image',
      sourceId: imageOcid,
    },
    metadata: {
      ssh_authorized_keys: env.SSH_PUBLIC_KEY,
      user_data: Buffer.from(cloudInitScript).toString('base64'),
    },
  },
  {
    deleteBeforeReplace: true,
  }
);

// Attach Volume
const volumeAttachment = new oci.core.VolumeAttachment(
  'angel-volume-attachment',
  {
    instanceId: instance.id,
    volumeId: volume.id,
    attachmentType: 'paravirtualized',
    device: env.VOLUME_DEVICE,
  },
  {
    deleteBeforeReplace: true,
  }
);

// Wait for cloud-init to complete on the instance before finishing the deployment
const sshPrivateKey = fs.readFileSync(env.SSH_PRIVATE_KEY_PATH, 'utf8');

const awaitForCloudInit = new command.remote.Command(
  'await-cloud-init',
  {
    connection: {
      host: instance.publicIp,
      user: 'opc',
      privateKey: sshPrivateKey,
    },
    create: 'sudo cloud-init status --wait',
    triggers: [instance.id],
  },
  {
    dependsOn: [instance],
    customTimeouts: { create: '10m' },
  }
);

// Volume Mount Command
const volumeMount = new command.remote.Command(
  'volume-mount',
  {
    connection: {
      host: instance.publicIp,
      user: 'opc',
      privateKey: sshPrivateKey,
    },
    create: `cat > /tmp/volume-mount.sh << 'SCRIPT_END'\n${volumeMountScript}\nSCRIPT_END\nsudo bash /tmp/volume-mount.sh`,
    triggers: [instance.id, volumeAttachment.id],
  },
  {
    dependsOn: [volumeAttachment],
    customTimeouts: { create: '5m' },
  }
);

// n8n Deployment Command
const n8nDeployment = new command.remote.Command(
  'n8n-deployment',
  {
    connection: {
      host: instance.publicIp,
      user: 'opc',
      privateKey: sshPrivateKey,
    },
    create: `cat > /tmp/n8n-deployment.sh << 'SCRIPT_END'\n${n8nDeploymentScript}\nSCRIPT_END\nsudo bash /tmp/n8n-deployment.sh`,
    triggers: [instance.id, dockerComposeContent],
  },
  {
    dependsOn: [awaitForCloudInit, volumeMount],
    customTimeouts: { create: '5m' },
  }
);

// DuckDNS Setup Command (can run in parallel with n8n)
const duckdnsSetup = new command.remote.Command(
  'duckdns-setup',
  {
    connection: {
      host: instance.publicIp,
      user: 'opc',
      privateKey: sshPrivateKey,
    },
    create: `cat > /tmp/duckdns-setup.sh << 'SCRIPT_END'\n${duckdnsScript}\nSCRIPT_END\nsudo bash /tmp/duckdns-setup.sh`,
    triggers: [instance.id, env.DUCK_DNS_TOKEN],
  },
  {
    dependsOn: [],
    customTimeouts: { create: '2m' },
  }
);

// Outputs
export const publicIp = instance.publicIp;
export const instanceId = instance.id;
export const instanceName = instance.displayName;
