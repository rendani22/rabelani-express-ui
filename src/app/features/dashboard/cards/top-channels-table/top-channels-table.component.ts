import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableChannel} from '../../../../core/models/models';

@Component({
  selector: 'app-top-channels-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-channels-table.component.html',
  styleUrls: ['./top-channels-table.component.css']
})
export class TopChannelsTableComponent {
  @Input() title = 'Top Channels';

  @Input() channels: TableChannel[] = [
    {
      name: 'Github.com',
      iconSvg: `<circle fill="#24292E" cx="18" cy="18" r="18"></circle><path d="M18 10.2c-4.4 0-8 3.6-8 8 0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4V24c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.7-3.7 3.9.3.4.6.9.6 1.6v2.2c0 .2.1.5.6.4 3.2-1.1 5.5-4.1 5.5-7.6-.1-4.4-3.7-8-8.1-8z" fill="#FFF"></path>`,
      iconBgColor: '#24292E',
      visitors: '2.4K',
      revenues: '$3,877',
      sales: '267',
      conversion: '4.7%'
    },
    {
      name: 'Facebook',
      iconSvg: `<circle fill="#1877F2" cx="18" cy="18" r="18"></circle><path d="M16.023 26 16 19h-3v-3h3v-2c0-2.7 1.672-4 4.08-4 1.153 0 2.144.086 2.433.124v2.821h-1.67c-1.31 0-1.563.623-1.563 1.536V16H23l-1 3h-2.72v7h-3.257Z" fill="#FFF" fill-rule="nonzero"></path>`,
      iconBgColor: '#1877F2',
      visitors: '2.2K',
      revenues: '$3,426',
      sales: '249',
      conversion: '4.4%'
    },
    {
      name: 'Google (organic)',
      iconSvg: `<circle fill="#EA4335" cx="18" cy="18" r="18"></circle><path d="M18 17v2.4h4.1c-.2 1-1.2 3-4 3-2.4 0-4.3-2-4.3-4.4 0-2.4 2-4.4 4.3-4.4 1.4 0 2.3.6 2.8 1.1l1.9-1.8C21.6 11.7 20 11 18.1 11c-3.9 0-7 3.1-7 7s3.1 7 7 7c4 0 6.7-2.8 6.7-6.8 0-.5 0-.8-.1-1.2H18z" fill="#FFF" fill-rule="nonzero"></path>`,
      iconBgColor: '#EA4335',
      visitors: '2.0K',
      revenues: '$2,444',
      sales: '224',
      conversion: '4.2%'
    },
    {
      name: 'Vimeo.com',
      iconSvg: `<circle fill="#4BC9FF" cx="18" cy="18" r="18"></circle><path d="M26 14.3c-.1 1.6-1.2 3.7-3.3 6.4-2.2 2.8-4 4.2-5.5 4.2-.9 0-1.7-.9-2.4-2.6C14 19.9 13.4 15 12 15c-.1 0-.5.3-1.2.8l-.8-1c.8-.7 3.5-3.4 4.7-3.5 1.2-.1 2 .7 2.3 2.5.3 2 .8 6.1 1.8 6.1.9 0 2.5-3.4 2.6-4 .1-.9-.3-1.9-2.3-1.1.8-2.6 2.3-3.8 4.5-3.8 1.7.1 2.5 1.2 2.4 3.3z" fill="#FFF" fill-rule="nonzero"></path>`,
      iconBgColor: '#4BC9FF',
      visitors: '1.9K',
      revenues: '$2,236',
      sales: '220',
      conversion: '4.2%'
    },
    {
      name: 'Indiehackers.com',
      iconSvg: `<circle fill="#0E2439" cx="18" cy="18" r="18"></circle><path d="M14.232 12.818V23H11.77V12.818h2.46zM15.772 23V12.818h2.462v4.087h4.012v-4.087h2.456V23h-2.456v-4.092h-4.012V23h-2.461z" fill="#E6ECF4"></path>`,
      iconBgColor: '#0E2439',
      visitors: '1.7K',
      revenues: '$2,034',
      sales: '204',
      conversion: '3.9%'
    }
  ];
}

