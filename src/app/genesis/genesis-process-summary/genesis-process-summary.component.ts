import { ActivatedRoute, Router } from '@angular/router';
import { Component } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { BehaviorSubject, combineLatest, interval } from 'rxjs';

import { filter, startWith, switchMap } from 'rxjs/operators';
import { SystemService } from '../../core/system.service';
import { MessageBoxService } from '../../shared/components/message-box/message-box.service';
import { AbstractComponent } from '../../core/abstract.component';
import { GenesisProcessService } from '../genesis-process.service';
import { GenesisProcessPaginatedModel } from '../shared/model/genesis-process-paginated.model';
import { PaginationModel } from '../../shared/model/pagination.model';
import { GenesisProcessModel } from '../shared/model/genesis-process.model';
import { GenesisStates } from '../genesis.states';
import { ChartDataModel } from '../../shared/components/chart/model/chart-data.model';
import { ChartHelper } from '../../shared/helper/chart.helper';
import { GenesisProcessStepEnum } from '../shared/enum/genesis-process-step.enum';

@Component({
    selector: 'app-genesis-process-summary',
    templateUrl: './genesis-process-summary.component.html',
    styleUrls: ['./genesis-process-summary.component.scss']
})
export class GenesisProcessSummaryComponent extends AbstractComponent {

    private TIMER = interval(2000).pipe(startWith(0));
    private FORCE_UPDATE = new BehaviorSubject<boolean>(true);
    private REQUESTING = false;

    public title: string;
    public subTitle: string;
    public genesisProcess: GenesisProcessPaginatedModel;
    public pagination = {
        limit: 5,
        page: 1
    } as PaginationModel;

    constructor(
        public systemService: SystemService,
        public messageBoxService: MessageBoxService,
        public genesisProcessService: GenesisProcessService,
        private router: Router,
        private route: ActivatedRoute
    ) {
        super(systemService, messageBoxService);
    }

    public ngOnInit(): void {
        this.initialize()
    }

    public eventLimitChanged(limit: number): void {
        this.pagination.limit = limit;
        this.forceUpdate();
    }
    public eventPageChanged(page: number): void {
        this.pagination.page = page;
        this.forceUpdate();
    }
    public eventNavigateToDetail(genesisProcess: GenesisProcessModel): void {
        this.router.navigate(['./', genesisProcess._id], {
            relativeTo: this.route
        });
    }
    public eventNewExecution(): void {
        this.router.navigate(['./' + GenesisStates.genesis.subStates.creation.path ], {
            relativeTo: this.route
        });
    }
    private forceUpdate(): void {
        this.FORCE_UPDATE.next(true);
        this.pushPaginationState();
    }
    public getExecutionCompleteState(genesisExecution: GenesisProcessModel): string {
        return this.isFailed(genesisExecution) ? 'Falhou' : 'Executado';
    }
    public getExecutionData(execution: GenesisProcessModel): ChartDataModel {
        const total = execution.executions.length;
        const completeness = parseFloat((execution.completeness * 100).toFixed(0));
        const completenessText = isNaN(completeness) ? 'Sem dados' : completeness + '%';
        const completenessTooltip = ChartHelper.buildTooltip('Executado ' + completenessText, 'ui-chart-tooltip');
        const executedTooltip = ChartHelper.buildTooltip('Executado ' + completenessText, 'ui-chart-tooltip');
        const plots = [
            ChartHelper.buildGaugeGenericPlotDataModel(
                total, 0, 1, 52, 54,
                'ui-chart-gauge-meter-default',
                completenessTooltip
            )
        ];
        if (execution.step !== GenesisProcessStepEnum.WAITING) {
            const cssClass = (execution.step !== GenesisProcessStepEnum.COMPLETE) ? ['ui-linear-gradient-default-initial', 'ui-linear-gradient-default-endless'] :
                ['ui-linear-gradient-success-initial', 'ui-linear-gradient-success-endless'];
            const effect = ChartHelper.buildGradientEffect(
                'gradient-execution-' + new Date().getTime() + execution._id,
                { class: cssClass[0], offset: '0%' },
                { class: cssClass[1], offset: '100%'},
                ['stroke', 'fill']
            );
            const executionPloCssClass = (execution.completedDate) ? 'ui-chart-gauge-meter-path': 'ui-chart-gauge-meter-path ui-chart-gauge-pulse';
            plots.push(
                ChartHelper.buildGaugeGenericPlotDataModel(
                    total, 0, 1 * execution.completeness,
                    50, 56, executionPloCssClass,
                    executedTooltip,
                    [effect]
                )
            );
        }
        return {
            tooltip: completenessTooltip,
            informations: {
                progress: ChartHelper.buildContextInformation(completenessText, 0, 10)
            },
            size: {
                width: 220,
                height: 140
            },
            plots
        } as ChartDataModel;
    }
    public getExecutionTime(execution: GenesisProcessModel): string {
        let time;

        if (!execution.completedDate) {
            time = new Date().getTime() - new Date(execution.creationDate).getTime()
        } else {
            time = new Date(execution.completedDate).getTime() - new Date(execution.creationDate).getTime();
        }

        return (time / 1000 / 60).toFixed(2) + ' minutos'
    }
    private handleGenesisProcessContainer(genesisProcess: GenesisProcessPaginatedModel): void {
        this.genesisProcess = genesisProcess;
        this.title = 'Execu????es';

        if (this.genesisProcess.size > 0) {
            this.subTitle = 'Encontradas ' + this.genesisProcess.size;
        } else {
            this.subTitle = 'Nenhuma Execu????o Encontrada';
        }
    }
    private initialize(): void {
        this.title = 'Buscando execu????es';
        this.subTitle = 'Aguarde';

        this.initializeRoute();
        this.watchGenesisProcess();
    }
    private initializeRoute(): void {
        const queryParams = this.route.snapshot.queryParams;

        if (queryParams.page && queryParams.limit) {
            this.pagination = {
                limit: parseInt(queryParams.limit),
                page: parseInt(queryParams.page)
            }
        } else {
            this.pushPaginationState(true);
        }
    }
    private isFailed(genesisExecution: GenesisProcessModel): boolean {
        return genesisExecution.result.status === 'fail';
    }
    private pushPaginationState(replace = false): void {
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {
                limit: this.pagination.limit,
                page: this.pagination.page
            },
            replaceUrl: replace
        })
    }
    private trackById(index: number, item: GenesisProcessModel): any {
        return item._id;
    }
    private watchGenesisProcess(): void {
        this.subscriptions$.add(combineLatest([
            this.TIMER,
            this.FORCE_UPDATE.pipe(filter((update) => update === true)),
        ]).pipe(
            filter((values: [number, boolean]) => {
                return !this.REQUESTING || values[1] === true
            }),
            switchMap(() => {
                this.REQUESTING = true;
                return this.genesisProcessService.getProcess({}, this.pagination);
            })
        ).subscribe(
            (genesisProcess: GenesisProcessPaginatedModel) => {
                this.handleGenesisProcessContainer(genesisProcess);
                this.FORCE_UPDATE.next(false);
                this.REQUESTING = false;
            },
            (error: HttpErrorResponse) => {
                this.openErrorMessageBox(error);
            }
        ));
    }
}
