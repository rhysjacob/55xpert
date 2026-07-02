export * from './autoPredictApi';
import { AutoPredictApi } from './autoPredictApi';
export * from './autoTraderApi';
import { AutoTraderApi } from './autoTraderApi';
export * from './bregoApi';
import { BregoApi } from './bregoApi';
export * from './cartellApi';
import { CartellApi } from './cartellApi';
export * from './cazanaApi';
import { CazanaApi } from './cazanaApi';
export * from './clearWattApi';
import { ClearWattApi } from './clearWattApi';
export * from './driveRightDataApi';
import { DriveRightDataApi } from './driveRightDataApi';
export * from './eVDatabaseApi';
import { EVDatabaseApi } from './eVDatabaseApi';
export * from './eVOXImagesApi';
import { EVOXImagesApi } from './eVOXImagesApi';
export * from './experianApi';
import { ExperianApi } from './experianApi';
export * from './ezyvinApi';
import { EzyvinApi } from './ezyvinApi';
export * from './marketcheckApi';
import { MarketcheckApi } from './marketcheckApi';
export * from './oneAutoAPIApi';
import { OneAutoAPIApi } from './oneAutoAPIApi';
export * from './sagacityApi';
import { SagacityApi } from './sagacityApi';
export * from './salvageGuideApi';
import { SalvageGuideApi } from './salvageGuideApi';
export * from './solifiVehicleDataApi';
import { SolifiVehicleDataApi } from './solifiVehicleDataApi';
export * from './uKVehicleDataApi';
import { UKVehicleDataApi } from './uKVehicleDataApi';
export * from './vehicleImageryApi';
import { VehicleImageryApi } from './vehicleImageryApi';
import * as http from 'http';

export class HttpError extends Error {
    constructor (public response: http.IncomingMessage, public body: any, public statusCode?: number) {
        super('HTTP request failed');
        this.name = 'HttpError';
    }
}

export { RequestFile } from '../model/models';

export const APIS = [AutoPredictApi, AutoTraderApi, BregoApi, CartellApi, CazanaApi, ClearWattApi, DriveRightDataApi, EVDatabaseApi, EVOXImagesApi, ExperianApi, EzyvinApi, MarketcheckApi, OneAutoAPIApi, SagacityApi, SalvageGuideApi, SolifiVehicleDataApi, UKVehicleDataApi, VehicleImageryApi];
