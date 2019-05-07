import nanoid from 'nanoid';
import { Entity } from './Entity';
import { Schema, type, MapSchema } from '@colyseus/schema';

const WORLD_SIZE = 2000;
const DEFAULT_PLAYER_RADIUS = 10;

export class State extends Schema {
  @type('int16')
  public width = WORLD_SIZE;
  @type('int16')
  public height = WORLD_SIZE;

  @type({ map: Entity })
  public entities = new MapSchema<Entity>(); // : { [id: string]: Entity } = {};

  constructor() {
    super();
    // create some food entities
    for (let i = 0; i < 100; i++) {
      this.createFood();
    }
  }

  public createFood() {
    const food = new Entity(
      Math.random() * this.width,
      Math.random() * this.height,
      2
    );
    this.entities[nanoid()] = food;
  }

  public createPlayer(sessionId: string) {
    this.entities[sessionId] = new Entity(
      Math.random() * this.width,
      Math.random() * this.height,
      DEFAULT_PLAYER_RADIUS
    );
  }

  public update() {
    const deadEntities: string[] = [];
    for (const sessionId in this.entities) {
      if (this.entities.hasOwnProperty(sessionId)) {
        const entity = this.entities[sessionId];

        if (entity.dead) {
          deadEntities.push(sessionId);
        }

        if (entity.radius >= DEFAULT_PLAYER_RADIUS) {
          for (const collideSessionId in this.entities) {
            if (this.entities.hasOwnProperty(collideSessionId)) {
              const collideTestEntity = this.entities[collideSessionId];

              // prevent collision with itself
              if (collideTestEntity === entity) {
                continue;
              }

              if (Entity.distance(entity, collideTestEntity) < entity.radius) {
                entity.radius += collideTestEntity.radius / 5;
                collideTestEntity.dead = true;
                deadEntities.push(collideSessionId);

                // create a replacement food
                if (collideTestEntity.radius < DEFAULT_PLAYER_RADIUS) {
                  this.createFood();
                }
              }
            }
          }
        }

        if (entity.speed > 0) {
          entity.x -= Math.cos(entity.angle) * entity.speed;
          entity.y -= Math.sin(entity.angle) * entity.speed;

          // apply boundary limits
          if (entity.x < 0) {
            entity.x = 0;
          }
          if (entity.x > WORLD_SIZE) {
            entity.x = WORLD_SIZE;
          }
          if (entity.y < 0) {
            entity.y = 0;
          }
          if (entity.y > WORLD_SIZE) {
            entity.y = WORLD_SIZE;
          }
        }

        // delete all dead entities
        deadEntities.forEach(entityId => delete this.entities[entityId]);
      }
    }
  }
}
