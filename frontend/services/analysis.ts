import type { AnalysisRequest, AnalysisResponse } from "@/lib/domain";
import type { AnalysisService } from "./contracts";


export class ClipAwareAnalysisService implements AnalysisService {
  constructor(
    private readonly demoService: AnalysisService,
    private readonly clipService: AnalysisService,
  ) {}

  analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    return request.clipId
      ? this.clipService.analyze(request)
      : this.demoService.analyze(request);
  }
}
