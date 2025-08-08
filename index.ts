import * as fs from 'fs';
import * as oci from '@pulumi/oci';
import { Config } from '@pulumi/pulumi';

const customConfig = new Config('angel');

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
        min: 5678,
        max: 5678,
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

// Init Script
const dockerComposeContent = fs.readFileSync('./init/docker-compose.yml', 'utf-8');

const cloudInitScript = fs
  .readFileSync('./init/init-script.sh', 'utf-8')
  .replace('__DOCKER_COMPOSE_CONTENT__', dockerComposeContent);

// Compute Instance
const instance = new oci.core.Instance('angel-instance', {
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
    ssh_authorized_keys: customConfig.require('sshPublicKey'),
    user_data: Buffer.from(cloudInitScript).toString('base64'),
  },
});

// Outputs
export const publicIp = instance.publicIp;
export const instanceId = instance.id;
export const instanceName = instance.displayName;
