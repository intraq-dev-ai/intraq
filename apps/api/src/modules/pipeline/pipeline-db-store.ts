import type { IncomingMessage } from 'node:http';
import { uuidv7 } from '@intraq/contracts';
import type { IntraQPrismaClient, Prisma } from '@intraq/db';
import { getRequestSecurityContext } from '../../security/request-context.js';
import type { PipelineRecord } from './foundation-store.js';
import { syncPipelineApiDataModelConfig } from './pipeline-api-model-sync.js';
import {
  normalizePipelineConnection,
  normalizePipelineNode,
  scheduleString,
  toInputJson,
  toPipelineRecord,
  type DbPipelineRow
} from './pipeline-record-mappers.js';

export function pipelineScopeWhere(req: IncomingMessage): Prisma.PipelineWhereInput {
  const context = getRequestSecurityContext(req);
  return context?.tenantId
    ? { OR: [{ tenantId: context.tenantId }, { isGlobal: true }] }
    : {};
}

export async function findDbPipeline(
  db: IntraQPrismaClient,
  req: IncomingMessage,
  id: string
): Promise<DbPipelineRow | null> {
  return db.pipeline.findFirst({
    where: {
      id,
      ...pipelineScopeWhere(req)
    },
    include: {
      connections: true,
      nodes: true,
      runs: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  }) as Promise<DbPipelineRow | null>;
}

export async function createDbPipeline(
  db: IntraQPrismaClient,
  req: IncomingMessage,
  pipeline: PipelineRecord
): Promise<PipelineRecord> {
  const context = getRequestSecurityContext(req);
  const created = await db.pipeline.create({
    data: {
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      status: pipeline.status,
      isActive: pipeline.isActive,
      config: toInputJson(pipeline.config),
      schedule: scheduleString(pipeline.schedule),
      ...(context?.tenantId ? { tenantId: context.tenantId } : {}),
      createdBy: context?.userId ?? pipeline.createdBy
    }
  });
  await replaceDbPipelineGraph(db, created.id, pipeline.nodes, pipeline.connections);
  await syncPipelineApiDataModelConfig(db, pipeline);
  const reloaded = await db.pipeline.findUnique({
    where: { id: created.id },
    include: {
      connections: true,
      nodes: true,
      runs: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  }) as DbPipelineRow | null;
  return toPipelineRecord(reloaded ?? { ...created, connections: [], nodes: [], runs: [] });
}

export async function updateDbPipelineRecord(
  db: IntraQPrismaClient,
  id: string,
  pipeline: PipelineRecord
): Promise<PipelineRecord> {
  await db.pipeline.update({
    where: { id },
    data: {
      name: pipeline.name,
      description: pipeline.description,
      status: pipeline.status,
      isActive: pipeline.isActive,
      config: toInputJson(pipeline.config),
      schedule: scheduleString(pipeline.schedule)
    }
  });
  await replaceDbPipelineGraph(db, id, pipeline.nodes, pipeline.connections);
  await syncPipelineApiDataModelConfig(db, pipeline);
  const reloaded = await db.pipeline.findUnique({
    where: { id },
    include: {
      connections: true,
      nodes: true,
      runs: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  }) as DbPipelineRow | null;
  return toPipelineRecord(reloaded as DbPipelineRow);
}

async function replaceDbPipelineGraph(
  db: IntraQPrismaClient,
  pipelineId: string,
  nodes: PipelineRecord['nodes'],
  connections: PipelineRecord['connections']
): Promise<void> {
  await db.pipelineConnection.deleteMany({ where: { pipelineId } });
  await db.pipelineNode.deleteMany({ where: { pipelineId } });
  const normalizedNodes = nodes.map(node => normalizePipelineNode(node));
  for (const node of normalizedNodes) {
    await db.pipelineNode.create({
      data: {
        id: node.id,
        pipelineId,
        nodeType: node.type,
        label: node.label,
        position: toInputJson({ x: node.x, y: node.y }),
        config: toInputJson({ ...node.config, name: node.name })
      }
    });
  }
  const nodeIds = new Set(normalizedNodes.map(node => node.id));
  for (const rawConnection of connections) {
    const connection = normalizePipelineConnection(rawConnection);
    if (!connection) continue;
    if (!nodeIds.has(connection.from) || !nodeIds.has(connection.to)) continue;
    await db.pipelineConnection.create({
      data: {
        id: connection.id || uuidv7(),
        pipelineId,
        fromNodeId: connection.from,
        toNodeId: connection.to,
        config: toInputJson({})
      }
    });
  }
}
